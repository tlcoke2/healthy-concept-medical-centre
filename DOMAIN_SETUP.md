# Clinic domain cutover

Target: https://healthyconceptmedical.com/
Current live website: https://tlcoke2.github.io/healthy-concept-medical-centre/
Mailbox: thuemancoke@healthyconceptmedical.com
DNS host: Porkbun. Mail host: Zoho EU.

## Deployment order

1. Once Railway builds resume, retain existing ALLOWED_ORIGINS entries and append https://healthyconceptmedical.com and https://www.healthyconceptmedical.com. Set CLINIC_EMAIL to thuemancoke@healthyconceptmedical.com. Keep the working MAIL_FROM and RESEND_API_KEY; Zoho mailbox verification does not verify a Resend sender. Deploy latest main with backend as root directory.
2. Check /health, /api/public/config and /api/news. Verify both new origins are accepted. assistantEnabled requires the configured AI flag and key; test one non-sensitive question after activation.
3. In GitHub repository Settings → Pages, set Custom domain to healthyconceptmedical.com. This is an Actions deployment: a CNAME file alone does not configure the domain.
4. In Porkbun DNS, replace conflicting website parking records with the records below. Preserve Zoho MX, verification TXT, SPF and DKIM records.
5. Wait for DNS/certificate provisioning, then enable Enforce HTTPS in GitHub Pages and verify both hostnames.
6. Change canonical/share/feed/sitemap base URLs from the GitHub Pages address to the new domain in dist/index.html, dist/hub.js, scripts/build_content.py and any other matching source. Run python3 scripts/build_content.py and publish.
7. Submit one agreed test appointment, verify delivery to Zoho, then remove the test through the authenticated admin API.

## Website DNS records

| Type | Host | Value |
| --- | --- | --- |
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | tlcoke2.github.io |

Porkbun may represent the apex host with a blank field. Inspect existing records before replacing parking entries. Do not add a CNAME at the apex because mail records must coexist there.

## Email verification

Send and receive a test from an independent mailbox. In Zoho Admin, verify DKIM using the actual selector supplied there; do not invent a selector. No DMARC policy was found at the initial DNS check. Configure a monitoring policy after confirming legitimate sending sources. Do not replace the existing SPF record with a second SPF record.

## Social profiles

Instagram registration uses the new mailbox; owner reports selfie submitted and approval pending. Do not recreate the account. Facebook business Page still needs owner sign-in. Public profile links must only be added once verified.

Sources: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site and https://kb.porkbun.com/article/68-what-is-dns-and-how-do-i-edit-it
