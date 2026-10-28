# Security guidance

## Network defaults

- Every component listens on `127.0.0.1`. Keep it that way unless remote access is required.
- On EC2, keep security groups closed except for SSH (restricted to your IP) and, if needed, HTTPS to a reverse proxy.
- Do not expose Prometheus, Alertmanager, Loki, Tempo or Alloy directly to the internet. They have no or weak authentication by default.
- If telemetry must cross hosts: use a private network (VPC/VPN), TLS, and authentication (reverse proxy with basic auth or mTLS, or native TLS options).
- Grafana: set a strong admin password on first login, disable anonymous access, and serve it through a TLS-terminating proxy.

## Secret injection

Never commit secrets. This stack uses:

| Secret | Mechanism |
|---|---|
| Alertmanager SMTP password | File referenced by `smtp_auth_password_file` (Alertmanager does not expand env vars) |
| Loki object-storage keys | `${VAR}` expansion with `-config.expand-env=true`, values from a systemd `EnvironmentFile` |
| Alloy settings | `sys.env("NAME")` from a systemd `EnvironmentFile` |
| App settings | systemd `EnvironmentFile` |

Example: create the SMTP password file from a value you hold in a secret manager or your shell (never in Git):

```bash
sudo install -d -m 0750 -o root -g alertmanager /etc/alertmanager/secrets
read -rs SMTP_PASSWORD   # type it; it is not echoed or stored in history
printf '%s' "$SMTP_PASSWORD" | sudo install -m 0440 -o root -g alertmanager /dev/stdin /etc/alertmanager/secrets/smtp_password
unset SMTP_PASSWORD
```

Environment files: `sudo install -m 0640 -o root -g <service-group> /dev/null /etc/<service>/<service>.env`, then edit as root. Where available, systemd credentials (`LoadCredential=`) or a secret manager (AWS Secrets Manager, SSM Parameter Store) are stronger than plain files.

## Least privilege

- Run each component as its own non-login system user.
- Give each user write access only to its own data directory.
- Object storage keys: scope to a single bucket, read/write/delete only on that bucket.
- Use systemd hardening (see `docs/native-installation.md`): `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, explicit `ReadWritePaths`.

## Data hygiene

- Do not log passwords, `Authorization` headers, tokens, session IDs, or personal data.
- Do not use user IDs, emails, full URLs or query strings as metric or log labels.
- Redact before logging. Consider Alloy `stage.replace` for known patterns, but treat it as a safety net, not a substitute for not logging secrets.

## Before publishing a repository

Follow the final checklist in the root README. Remember that Git history and commit author emails are public, and that screenshots can leak hostnames and account details. Rotate any credential that was ever exposed, even if you removed it later.
