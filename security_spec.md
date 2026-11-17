# Mashaer Customer Care Hub — Security Specification

## 1. Data Invariants
1. **Equal 7-Admin Governance**: The 7 admin emails (`rawi@mashaer.store`, `a.ayman@mashaer.store`, `abdoun@mashaer.store`, `a.ashry@mashaer.store`, `s.refaat@mashaer.store`, `sararefaat79@gmail.com`, `mayadamashaer@gmail.com`) possess identical, non-hierarchical administrative privileges. None of them can suspend, demote, or delete any of the 7 core admin records.
2. **Verified Identity**: Every authenticated read/write requires `request.auth != null`, `request.auth.token.email != null`, and `request.auth.token.email_verified == true`.
3. **Authorized Staff Gate**: Non-admin users can only read operational data if their normalized email key exists in `authorized_users` with `status == 'active'` and `role == 'employee'`. Suspended or unknown users are immediately blocked.
4. **No Self-Privilege Escalation**: Employees cannot write to `authorized_users`, cannot list other users' PII in `authorized_users`, and cannot write to any knowledge base, product, system link, credential, or setting collection.
5. **Visibility-Scoped Credentials Isolation**: `system_credentials` is stored in a dedicated collection separate from `system_links`. Systems marked `admins_only` are strictly restricted to `isAdmin()` for both `read` and `write`, while systems explicitly marked `all_staff` allow read access (`get` / visibility-filtered `list`) to active verified employees and write access exclusively to `isAdmin()`.
6. **Immutable Audit Trail**: `audit_logs` can only be created by verified admins (`actorUid == request.auth.uid`, `actorEmail` matches token, `createdAt == request.time`) and can NEVER be updated or deleted.
7. **Temporal & Schema Integrity**: Every write enforces `isValid[Entity](incoming())`, strict `hasAll` / `hasOnly` key allowlists, string `.size()` limits, valid ID regex (`^[a-zA-Z0-9_\-]+$`), and server timestamps (`request.time`).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Admin Email Spoof**: Token with `email: "rawi@mashaer.store"` and `email_verified: false` attempting `get` on `audit_logs` -> `PERMISSION_DENIED`.
2. **Unauthorized Stranger Read**: Verified Gmail `stranger@gmail.com` (not in `authorized_users`) attempting `list` on `canned_responses` -> `PERMISSION_DENIED`.
3. **Suspended Employee Read**: Active employee changed to `status: "suspended"` attempting `get` on `system_links/sys_mashaer_store` -> `PERMISSION_DENIED`.
4. **Employee Self-Promotion**: Active employee attempting `update` on `authorized_users/emp_example_com` with `{ role: "admin" }` -> `PERMISSION_DENIED`.
5. **Employee Reading Admins-Only Credentials**: Active employee attempting `get` on an `admins_only` `system_credentials` doc or an unfiltered `list` on `system_credentials` -> `PERMISSION_DENIED`.
6. **Employee Reading Audit Logs**: Active employee attempting `list` on `audit_logs` -> `PERMISSION_DENIED`.
7. **Employee Writing Content**: Active employee attempting `create` on `canned_responses/r1` -> `PERMISSION_DENIED`.
8. **Admin Demoting Core Admin**: One of the 7 admins attempting `update` or `delete` on `authorized_users/rawi_mashaer_store` to set `role: "employee"` or `status: "suspended"` -> `PERMISSION_DENIED`.
9. **Audit Log Tampering / Forgery**: Admin attempting `update` or `delete` on `audit_logs/log1`, or `create` with `actorEmail: "someone_else@mashaer.store"` -> `PERMISSION_DENIED`.
10. **Shadow Field Injection**: Admin attempting `create` on `products/p1` with an extra ghost field `{ isVerifiedHack: true }` -> `PERMISSION_DENIED`.
11. **ID Poisoning / Resource Exhaustion**: Admin attempting `create` on `products/invalid$id` or with `officialDescription` > 4000 chars -> `PERMISSION_DENIED`.
12. **Client Timestamp Forgery**: Admin attempting `create` on `canned_responses/r1` with backdated `createdAt` (`!= request.time`) -> `PERMISSION_DENIED`.
