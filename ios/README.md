# FinanceHub iOS (SwiftUI)

Native iOS client for FinanceHub. Consumes the existing PHP REST API (`/api/v1`).

## Build
```sh
cd ios
xcodegen generate
xcodebuild -project FinanceHub.xcodeproj -scheme FinanceHub \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

## Test
```sh
cd ios
xcodebuild -project FinanceHub.xcodeproj -scheme FinanceHub \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test
```

## Current status
- Phase 0: Xcode project, Swift Package core, Keychain auth, theme/RTL, API client with refresh, network monitor + offline banner, CI workflow, privacy toggle.
- Phase 1: Login, Dashboard, Wallets (CRUD + archive), Actions (create/edit), Categories (CRUD), Budgets (create/edit), Goals (create/edit), Transfer, Onboarding, Privacy toggle.
- Phase 2: Contacts, Debts, Recurring, Notifications, Insights, Calendar, Import/Export.
- Phase 3: Zakat, Gold, Tontines (list + detail).
- Phase 4: AI Chat, Monthly Report, Net Worth, Health Score, Forecast, Anomalies, Audit.
- Phase 5 (partial): Investments, Bills, Clients, Invoices, Settings.
- Phase 6 (partial): SwiftData offline cache (Wallets), network monitor banner.
- Remaining: Cashflow, Profit & Loss, Real Estate, Emergency Fund, Currencies, Smart Rules, Reconciliation, Installments, Onboarding (full), push (APNs/FCM), widgets, full offline mutation queue.

## Notes
- API base URL defaults to `http://localhost/api/v1` (see `APIConfiguration`).
- ATS allows arbitrary loads for dev; production must use HTTPS.
- `Category` is referenced as `FinanceHubCore.Category` to avoid collision with Objective-C runtime.
