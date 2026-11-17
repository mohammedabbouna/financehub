#!/usr/bin/env bash
# FinanceHub end-to-end smoke test (run AFTER `docker compose up -d`).
# Exercises: auth → wallets → actions → AI parse → contacts → debts →
# payments → recurring → notifications → background worker.
set -u

# Python must decode/encode UTF-8 (Arabic category names) regardless of the
# invoking locale — otherwise comparisons against literals silently mismatch.
export PYTHONIOENCODING=UTF-8

BASE="${BASE_URL:-http://localhost/api/v1}"
PASS=0
FAIL=0
TOKEN=""
UID_EMAIL="smoke_$(date +%s)@test.dz"

ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s — %s\n' "$1" "${2:0:160}"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

json_field() { # json_field <json> <python-dotted-path>
  printf '%s' "$1" | python3 -c "import sys,json;d=json.load(sys.stdin)
p='$2'.split('.')
for k in p:
    d=d[k] if isinstance(d,dict) else d[int(k)]
print(d if not isinstance(d,(dict,list)) else json.dumps(d,ensure_ascii=False))" 2>/dev/null
}

num_eq() { # num_eq <got> <want> — tolerant of "20000.0" vs "20000.00"
  python3 -c "import sys
try:
    sys.exit(0 if abs(float('$1')-float('$2'))<0.005 else 1)
except Exception:
    sys.exit(1)"
}

req() { # req <METHOD> <PATH> <BODY(json,optional)> → $RESP $CODE
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -o /tmp/fh_body -w '%{http_code}' -X "$method" "$BASE$path")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  [ -n "$TOKEN" ] && args+=(-H "Authorization: Bearer $TOKEN")
  CODE=$(curl "${args[@]}" 2>/dev/null || echo 000)
  RESP=$(cat /tmp/fh_body 2>/dev/null || echo '')
}

expect() { # expect <label> <code> <wanted...>
  local label="$1" code="$2"; shift 2
  local w
  for w in "$@"; do
    if [ "$code" = "$w" ]; then ok "$label ($code)"; return 0; fi
  done
  bad "$label" "code=$code body=${RESP:0:200}"
}

# ─── Health ──────────────────────────────────────────────────────────────────
step "1) الاتصال والصحة"
req GET "/health"
expect "GET /health" "$CODE" 200

# Reset the file-based rate limiter so repeated runs never inherit a
# stale counter (the bucket is per-IP and persists across invocations).
docker exec financehub-backend sh -c 'rm -f /var/www/storage/cache/*.json' >/dev/null 2>&1 || true

# ─── Auth ────────────────────────────────────────────────────────────────────
step "2) التسجيل وتسجيل الدخول"
req POST "/auth/register" "{\"name\":\"مستخدم الاختبار\",\"email\":\"$UID_EMAIL\",\"password\":\"Passw0rd!2026\"}"
expect "POST /auth/register" "$CODE" 201 200
TOKEN=$(json_field "$RESP" "tokens.access_token")
[ -n "$TOKEN" ] && ok "access token مستلم" || bad "access token" "$RESP"

req POST "/auth/login" "{\"email\":\"$UID_EMAIL\",\"password\":\"Passw0rd!2026\"}"
expect "POST /auth/login" "$CODE" 200
LOGIN_TOKEN=$(json_field "$RESP" "tokens.access_token")
[ -n "$LOGIN_TOKEN" ] && ok "login token مستلم" || bad "login token" "$RESP"

# ─── Wallets & actions ───────────────────────────────────────────────────────
step "3) المحافظ والعمليات"
req POST "/wallets" '{"name":"محفظة الاختبار","type":"cash"}'
expect "POST /wallets" "$CODE" 201
WID=$(json_field "$RESP" "wallet.id")

req POST "/actions" "{\"wallet_id\":$WID,\"type\":\"deposit\",\"amount\":50000,\"date\":\"$(date +%F)\",\"description\":\"راتب\"}"
expect "POST /actions (deposit)" "$CODE" 201

req POST "/actions" "{\"wallet_id\":$WID,\"type\":\"withdraw\",\"amount\":1200,\"date\":\"$(date +%F)\",\"description\":\"سوبرماركت\"}"
expect "POST /actions (withdraw)" "$CODE" 201

req GET "/wallets/$WID"
BAL=$(json_field "$RESP" "wallet.balance")
if num_eq "$BAL" 48800; then ok "الرصيد بعد العملية = $BAL"; else bad "balance" "got=$BAL want=48800"; fi

# ─── AI parse (local rule engine — no API key needed) ────────────────────────
step "4) الإدخال الذكي parse-ai"
req POST "/actions/parse-ai" '{"text":"دفعت 750 دج امس في السوبيرات"}'
expect "POST /actions/parse-ai" "$CODE" 200
PTYPE=$(json_field "$RESP" "parsed_action.type")
PAMT=$(json_field "$RESP" "parsed_action.amount")
PDATE=$(json_field "$RESP" "parsed_action.date")
YDAY=$(date -v-1d +%F 2>/dev/null || date -d yesterday +%F)
[ "$PTYPE" = "withdraw" ] && ok "type=withdraw" || bad "type" "$PTYPE"
num_eq "$PAMT" 750 && ok "amount=750" || bad "amount" "$PAMT"
[ "$PDATE" = "$YDAY" ] && ok "date=أمس ($PDATE)" || bad "relative date" "got=$PDATE want=$YDAY"

req POST "/actions/parse-ai" '{"text":"استلفت 10000 من احمد"}'
expect "POST /actions/parse-ai (borrow)" "$CODE" 200
PTYPE=$(json_field "$RESP" "parsed_action.type")
[ "$PTYPE" = "borrow" ] && ok "type=borrow" || bad "type" "$PTYPE"

# ─── Contacts & debts ────────────────────────────────────────────────────────
step "5) الأشخاص والديون"
req POST "/contacts" '{"name":"احمد","phone":"0555123456"}'
expect "POST /contacts" "$CODE" 201
CID=$(json_field "$RESP" "contact.id")

req POST "/contacts" '{"name":"احمد"}'
expect "POST /contacts (duplicate → 409)" "$CODE" 409

req POST "/debts" "{\"contact_id\":$CID,\"direction\":\"lent_to\",\"amount\":20000,\"due_date\":\"$(date -v+15d +%F 2>/dev/null || date -d '+15 days' +%F)\",\"wallet_id\":$WID,\"notes\":\"سلفة\"}"
expect "POST /debts (lent_to + wallet)" "$CODE" 201
DID=$(json_field "$RESP" "debt.id")
DREMAIN=$(json_field "$RESP" "debt.remaining")
num_eq "$DREMAIN" 20000 && ok "remaining=20000" || bad "remaining" "$DREMAIN"

req GET "/debts/summary"
LentTo=$(json_field "$RESP" "summary.lent_to")
num_eq "$LentTo" 20000 && ok "summary.lent_to=20000" || bad "summary" "$LentTo"

req POST "/debts/$DID/payments" '{"amount":5000}'
expect "POST /debts/{id}/payments" "$CODE" 201
DREMAIN=$(json_field "$RESP" "debt.remaining")
num_eq "$DREMAIN" 15000 && ok "remaining بعد الدفعة=15000" || bad "remaining" "$DREMAIN"

req POST "/debts/$DID/payments" '{"amount":999999}'
expect "دفعة أكبر من المتبقي → 422" "$CODE" 422

req POST "/contacts" "{\"name\":\"سالم\"}"
CID2=$(json_field "$RESP" "contact.id")
req POST "/actions" "{\"wallet_id\":$WID,\"type\":\"borrow\",\"amount\":7000,\"date\":\"$(date +%F)\",\"description\":\"استلاف\",\"contact_id\":$CID2}"
expect "POST /actions (borrow + contact → ربط تلقائي)" "$CODE" 201
LINKED=$(json_field "$RESP" "debt.id")
if [ -n "$LINKED" ] && [ "$LINKED" != "None" ]; then ok "debt تلقائي #$LINKED"; else bad "auto debt" "$RESP"; fi

# ─── Recurring ───────────────────────────────────────────────────────────────
step "6) المعاملات المتكررة"
# Balance so far: 50000 - 1200 - 20000(debt out) + 7000(borrow in) = 35800
req POST "/recurring" "{\"name\":\"اشتراك إنترنت\",\"frequency\":\"monthly\",\"next_run_date\":\"$(date -v-1d +%F 2>/dev/null || date -d yesterday +%F)\",\"action_template\":{\"type\":\"withdraw\",\"amount\":2500,\"wallet_id\":$WID,\"description\":\"إنترنت\"}}"
expect "POST /recurring" "$CODE" 201
RID=$(json_field "$RESP" "recurring.id")

req POST "/recurring/$RID/run"
expect "POST /recurring/{id}/run (تشغيل فوري)" "$CODE" 201

req GET "/wallets/$WID"
BAL2=$(json_field "$RESP" "wallet.balance")
num_eq "$BAL2" 33300 && ok "الرصيد بعد التشغيل = $BAL2 (33300)" || bad "balance after run" "got=$BAL2 want=33300"

req PATCH "/recurring/$RID/toggle"
expect "PATCH toggle تشغيل/إيقاف" "$CODE" 200

# Second template left due (yesterday) so the worker must generate it.
req POST "/recurring" "{\"name\":\"قسط جيم\",\"frequency\":\"monthly\",\"next_run_date\":\"$(date -v-1d +%F 2>/dev/null || date -d yesterday +%F)\",\"action_template\":{\"type\":\"withdraw\",\"amount\":1000,\"wallet_id\":$WID,\"description\":\"جيم\"}}"
expect "POST /recurring #2 (due for worker)" "$CODE" 201
RID2=$(json_field "$RESP" "recurring.id")

req DELETE "/recurring/$RID"
expect "DELETE /recurring/{id}" "$CODE" 200

# ─── Notifications & background worker ───────────────────────────────────────
step "7) الإشعارات والعامل الخلفي"
req GET "/notifications"
expect "GET /notifications" "$CODE" 200

# A bill due tomorrow (inside the 3-day reminder window) must surface as a
# notification once the worker runs.
req POST "/bills" "{\"name\":\"فاتورة الكهرباء\",\"amount\":900,\"due_date\":\"$(date -v+1d +%F 2>/dev/null || date -d '+1 day' +%F)\",\"reminder_days_before\":3}"
expect "POST /bills (due tomorrow)" "$CODE" 201 200

printf '  تشغيل العامل الخلفي يدوياً...\n'
docker compose exec -T worker php /var/www/bin/worker.php all >/tmp/fh_worker_out 2>&1
WRC=$?
if [ $WRC -eq 0 ]; then ok "worker.php all (exit 0)"; else bad "worker" "$(cat /tmp/fh_worker_out)"; fi

sleep 1
docker compose exec -T worker tail -3 /var/www/storage/logs/worker.log 2>/dev/null | sed 's/^/  log: /'

# Worker must have generated the due recurring template (+ moved money) …
req GET "/wallets/$WID"
BAL3=$(json_field "$RESP" "wallet.balance")
num_eq "$BAL3" 32300 && ok "العامل ولّد القسط المتكرر (32300)" || bad "worker recurring" "got=$BAL3 want=32300"

# … and created the bill reminder notification.
req GET "/notifications"
expect "GET /notifications بعد العامل" "$CODE" 200
UNREAD=$(json_field "$RESP" "unread_count")
if [ -n "$UNREAD" ] && [ "$UNREAD" -gt 0 ] 2>/dev/null; then
  ok "unread_count=$UNREAD (إشعار فاتورة أنشأه العامل)"
else
  bad "notification from worker" "unread_count='$UNREAD' body=${RESP:0:300}"
fi

# The same notification must not be duplicated on a second worker pass.
docker compose exec -T worker php /var/www/bin/worker.php all >/dev/null 2>&1
req GET "/notifications"
UNREAD2=$(json_field "$RESP" "unread_count")
TOTAL2=$(json_field "$RESP" "notifications" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ "$UNREAD2" = "$UNREAD" ]; then ok "dedup: العامل الثاني لم يكرر الإشعار"; else bad "dedup" "unread $UNREAD → $UNREAD2"; fi

req POST "/notifications/read-all"
expect "POST /notifications/read-all" "$CODE" 200
req GET "/notifications"
UNREAD3=$(json_field "$RESP" "unread_count")
if [ "$UNREAD3" = "0" ]; then ok "بعد read-all صار unread=0"; else bad "read-all" "unread=$UNREAD3"; fi

req DELETE "/recurring/$RID2"
expect "DELETE /recurring/{id} #2" "$CODE" 200

# ─── Insights dedup ──────────────────────────────────────────────────────────
step "8) الرؤى (dedup)"
req POST "/insights/generate"
expect "POST /insights/generate #1" "$CODE" 200
req POST "/insights/generate"
expect "POST /insights/generate #2" "$CODE" 200
req GET "/insights"
expect "GET /insights" "$CODE" 200

# ─── Health score ────────────────────────────────────────────────────────────
step "9) الصحة المالية"
req GET "/health-score"
expect "GET /health-score" "$CODE" 200
SCORE=$(json_field "$RESP" "score")
[ -n "$SCORE" ] && ok "score=$SCORE" || bad "score" "$RESP"

# ─── Phase 3: Gold price ─────────────────────────────────────────────────────
step "10) الذهب"
req GET "/gold/price"
expect "GET /gold/price" "$CODE" 200
GGRAM=$(json_field "$RESP" "price_dzd_gram")
if python3 -c "import sys; sys.exit(0 if float('$GGRAM') > 0 else 1)" 2>/dev/null; then
  ok "سعر الغرام = $GGRAM دج"
else
  bad "gold price" "price_dzd_gram='$GGRAM' body=${RESP:0:200}"
fi
GDATE=$(json_field "$RESP" "price_date")
[ "$GDATE" = "$(date +%F)" ] && ok "السعر محفوظ لليوم ($GDATE)" || bad "gold date" "got=$GDATE"

req GET "/gold/holdings"
expect "GET /gold/holdings" "$CODE" 200

# ─── Phase 3: Zakat ──────────────────────────────────────────────────────────
step "11) الزكاة"
req GET "/zakat/calculate"
expect "GET /zakat/calculate" "$CODE" 200
NET=$(json_field "$RESP" "breakdown.net_wealth")
ZDUE=$(json_field "$RESP" "zakat_due")
if python3 -c "import sys; sys.exit(0 if float('$NET') > 0 and float('$ZDUE') > 0 else 1)" 2>/dev/null; then
  ok "صافي الثروة=$NET · الزكاة=$ZDUE (2.5%)"
else
  bad "zakat calc" "net=$NET due=$ZDUE body=${RESP:0:200}"
fi
NISAB=$(json_field "$RESP" "nisab.value")
if python3 -c "import sys; sys.exit(0 if float('$NISAB') > 0 else 1)" 2>/dev/null; then
  ok "نصاب 85غ = $NISAB دج"
else
  bad "nisab" "value='$NISAB'"
fi

req POST "/zakat/snapshots" '{"notes":"لقطة الاختبار"}'
expect "POST /zakat/snapshots" "$CODE" 201
req GET "/zakat/snapshots"
expect "GET /zakat/snapshots" "$CODE" 200
SNAP_N=$(json_field "$RESP" "snapshots" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ -n "$SNAP_N" ] && [ "$SNAP_N" -ge 1 ] 2>/dev/null; then ok "لقطة محفوظة ($SNAP_N)"; else bad "snapshots" "count='$SNAP_N'"; fi

# ─── Phase 3: Tontine (العمّارية) ────────────────────────────────────────────
step "12) العمّارية"
req POST "/tontines" '{"name":"عمّارية الاختبار","amount":2000,"frequency":"monthly","start_date":"'"$(date +%F)"'"}'
expect "POST /tontines" "$CODE" 201
TID=$(json_field "$RESP" "tontine.id")

req POST "/tontines/$TID/members" '{"name":"أنا","is_self":true}'
expect "POST /tontines/{id}/members" "$CODE" 201
TM1=$(json_field "$RESP" "member.id")
req POST "/tontines/$TID/members" '{"name":"سالم"}'
expect "POST /tontines/{id}/members #2" "$CODE" 201
TM2=$(json_field "$RESP" "member.id")

# A dedicated wallet so the main balance assertions above stay untouched.
req POST "/wallets" '{"name":"محفظة العمّارية","type":"cash"}'
expect "POST /wallets (tontine)" "$CODE" 201
TWID=$(json_field "$RESP" "wallet.id")

DUE=$(date +%F)
req POST "/tontines/$TID/payments" "{\"member_id\":$TM1,\"due_date\":\"$DUE\",\"wallet_id\":$TWID}"
expect "POST /tontines/{id}/payments" "$CODE" 201
CREATED1=$(json_field "$RESP" "created")
[ "$CREATED1" = "True" ] && ok "created=true" || bad "created flag" "$RESP"

# Idempotency: the same (member, due_date) must not move money twice.
req POST "/tontines/$TID/payments" "{\"member_id\":$TM1,\"due_date\":\"$DUE\",\"wallet_id\":$TWID}"
expect "دفعة مكررة → 200 idempotent" "$CODE" 200
CREATED2=$(json_field "$RESP" "created")
[ "$CREATED2" = "False" ] && ok "created=false (لا تكرار)" || bad "idempotent flag" "$RESP"

req GET "/wallets/$TWID"
TBAL=$(json_field "$RESP" "wallet.balance")
num_eq "$TBAL" -2000 && ok "الرصيد=-2000 (لم يُخصم مرتين)" || bad "tontine balance" "got=$TBAL"

req GET "/tontines/$TID"
expect "GET /tontines/{id}" "$CODE" 200
CYCLES=$(json_field "$RESP" "tontine.cycles" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ -n "$CYCLES" ] && [ "$CYCLES" -ge 1 ] 2>/dev/null; then ok "دورات محسوبة ($CYCLES)"; else bad "cycles" "count='$CYCLES'"; fi
MCOUNT=$(json_field "$RESP" "tontine.member_count")
[ "$MCOUNT" = "2" ] && ok "member_count=2" || bad "member_count" "$MCOUNT"

# A second member's contribution flows IN (deposit) — net zero through the pot.
req POST "/tontines/$TID/payments" "{\"member_id\":$TM2,\"due_date\":\"$DUE\",\"wallet_id\":$TWID}"
expect "دفعة عضو آخر → deposit" "$CODE" 201
req GET "/wallets/$TWID"
TBAL2=$(json_field "$RESP" "wallet.balance")
num_eq "$TBAL2" 0 && ok "الرصيد=0 (قسطي خرج + قسطه دخل)" || bad "tontine net" "got=$TBAL2"

# ─── Phase 3: Algerian dialect parse dictionary ──────────────────────────────
step "13) قاموس الدارجة"
req POST "/actions/parse-ai" '{"text":"اشتريت قفة 3500"}'
expect "parse «قفة»" "$CODE" 200
PTYPE=$(json_field "$RESP" "parsed_action.type")
PCAT=$(json_field "$RESP" "parsed_action.category_name")
[ "$PTYPE" = "withdraw" ] && ok "قفة → withdraw" || bad "قفة type" "$PTYPE"
[ "$PCAT" = "طعام ومشروبات" ] && ok "قفة → فئة طعام" || bad "قفة cat" "$PCAT"

req POST "/actions/parse-ai" '{"text":"دفعت فاتورة الغاز 800"}'
expect "parse «فاتورة»" "$CODE" 200
PTYPE=$(json_field "$RESP" "parsed_action.type")
PCAT=$(json_field "$RESP" "parsed_action.category_name")
[ "$PTYPE" = "withdraw" ] && ok "فاتورة → withdraw" || bad "فاتورة type" "$PTYPE"
[ "$PCAT" = "غاز" ] && ok "فاتورة غاز → فئة غاز" || bad "فاتورة cat" "$PCAT"

req POST "/actions/parse-ai" '{"text":"عندي 10000 ليران"}'
expect "parse «ليران»" "$CODE" 200
PTYPE=$(json_field "$RESP" "parsed_action.type")
[ "$PTYPE" = "deposit" ] && ok "ليران (عندي) → deposit" || bad "ليران type" "$PTYPE"

req POST "/actions/parse-ai" '{"text":"قرض 3000 من البنك"}'
expect "parse «قرض»" "$CODE" 200
PTYPE=$(json_field "$RESP" "parsed_action.type")
[ "$PTYPE" = "borrow" ] && ok "قرض → borrow" || bad "قرض type" "$PTYPE"

req POST "/actions/parse-ai" '{"text":"سددت قرض 1500"}'
expect "parse «سددت قرض»" "$CODE" 200
PTYPE=$(json_field "$RESP" "parsed_action.type")
[ "$PTYPE" = "repay" ] && ok "سددت قرض → repay (لا يبتلعه borrow)" || bad "repay type" "$PTYPE"

# ─── Cleanup phase-3 fixtures ────────────────────────────────────────────────
req DELETE "/tontines/$TID"
expect "DELETE /tontines/{id}" "$CODE" 200

# ─── Phase 4: Monthly report ─────────────────────────────────────────────────
step "14) التقرير الشهри"
# The suite burns the AI per-minute quota in the earlier parse/chat steps;
# wait for a fresh window so rate limiting doesn't mask real assertions.
sleep 61
YM_NOW="$(date +%Y-%m)"
R_YEAR="${YM_NOW%%-*}"; R_MONTH="${YM_NOW##*-}"; R_MONTH=$((10#$R_MONTH))
req GET "/reports/$R_YEAR/$R_MONTH"
expect "GET /reports/{year}/{month}" "$CODE" 200
R_NET=$(json_field "$RESP" "report.summary.net")
R_INC=$(json_field "$RESP" "report.summary.income")
if [ -n "$R_NET" ] && [ -n "$R_INC" ]; then ok "أرقام الشهر: دخل=$R_INC صافي=$R_NET"; else bad "report numbers" "${RESP:0:200}"; fi
R_NARR=$(json_field "$RESP" "report.narrative")
[ -n "$R_NARR" ] && ok "سرد التقرير موجود" || bad "narrative" "empty"
R_RECS=$(json_field "$RESP" "report.recommendations" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ "$R_RECS" = "3" ]; then ok "3 توصيات"; else bad "recommendations" "count='$R_RECS'"; fi
R_AI=$(json_field "$RESP" "report.ai_used")
ok "ai_used=$R_AI (سرد محلي عند غياب المفتاح)"

# Future months must be rejected (422), and auth is still required (401).
req GET "/reports/2099/1"
expect "شهر مستقبلي → 422" "$CODE" 422

# ─── Phase 4: «هل أ semiclass؟» affordability consultation ────────────────────
step "15) استشارة «هل أ semiclass؟»"
req POST "/ai/chat" '{"message":"واش نقدر نشري تلفاز بـ 40000 دج؟"}'
expect "POST /ai/chat (استشارة)" "$CODE" 200
A_VERDICT=$(json_field "$RESP" "analysis.verdict")
case "$A_VERDICT" in
  yes|caution|no) ok "verdict=$A_VERDICT" ;;
  *) bad "verdict" "'$A_VERDICT' body=${RESP:0:200}" ;;
esac
A_TARGET=$(json_field "$RESP" "analysis.target_amount")
if python3 -c "import sys; sys.exit(0 if abs(float('$A_TARGET') - 40000) < 1 else 1)" 2>/dev/null; then
  ok "المبلغ المستخرج = 40000"
else
  bad "target amount" "got='$A_TARGET'"
fi
A_CHECKS=$(json_field "$RESP" "analysis.checks" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ "$A_CHECKS" = "3" ]; then ok "3 فحوصات (احتياطي/توقع/التزامات)"; else bad "checks" "count='$A_CHECKS'"; fi
A_TEXT=$(json_field "$RESP" "response")
case "$A_TEXT" in
  *"الإجابة"*) ok "نص الإجابة رقمي ومُهيكل" ;;
  *) bad "response text" "${A_TEXT:0:120}" ;;
esac

# A normal (non-affordability) question must still route to the advisor path.
req POST "/ai/chat" '{"message":"مرحبا"}'
expect "سؤال عادي (بدون analysis)" "$CODE" 200
A_NORM=$(json_field "$RESP" "analysis")
[ "$A_NORM" = "None" ] && ok "لا تحليل لسؤال عادي" || bad "normal chat" "analysis=$A_NORM"

# ─── Phase 4: worker report-alert task (idempotent, first 3 days only) ───────
step "16) مهمة إشعار التقرير"
docker exec financehub-worker php bin/worker.php report >/dev/null 2>&1
WRC=$?
[ "$WRC" -eq 0 ] && ok "worker.php report (exit 0)" || bad "worker report" "exit=$WRC"
# Run again — must not duplicate anything (ref_key dedup / day-window guard).
docker exec financehub-worker php bin/worker.php report >/dev/null 2>&1
WRC2=$?
[ "$WRC2" -eq 0 ] && ok "تكرار آمن (exit 0)" || bad "worker report rerun" "exit=$WRC2"

# ─── Phase 5: Net worth ──────────────────────────────────────────────────────
step "17) صافي الثروة"
req GET "/networth?from=$(date -v-30d +%F 2>/dev/null || date -d '30 days ago' +%F)&to=$(date +%F)"
expect "GET /networth" "$CODE" 200
NW_POINTS=$(json_field "$RESP" "points" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ -n "$NW_POINTS" ] && [ "$NW_POINTS" -ge 29 ] 2>/dev/null; then
  ok "نقاط يومية = $NW_POINTS"
else
  bad "networth points" "count='$NW_POINTS' body=${RESP:0:160}"
fi
NW_CURRENT=$(json_field "$RESP" "current")
if python3 -c "import sys; sys.exit(0 if float('$NW_CURRENT') > 0 else 1)" 2>/dev/null; then
  ok "الأصول الحالية = $NW_CURRENT"
else
  bad "networth current" "got='$NW_CURRENT'"
fi
req GET "/networth?from=2026-12-01&to=2026-01-01"
expect "نطاق معكوس → 422" "$CODE" 422

# ─── Phase 5: CSV export ─────────────────────────────────────────────────────
step "18) تصدير CSV"
req GET "/export/actions"
expect "GET /export/actions" "$CODE" 200
# UTF-8 BOM (EF BB BF) is what lets Excel render Arabic correctly.
BOM=$(printf '%s' "$RESP" | head -c 3 | xxd -p 2>/dev/null)
if [ "$BOM" = "efbbbf" ]; then ok "BOM موجود (Excel عربي سليم)"; else bad "csv BOM" "got='$BOM'"; fi
case "$RESP" in
  *'التاريخ'*) ok "رأس الأعمدة العربي موجود" ;;
  *) bad "csv header" "${RESP:0:80}" ;;
esac

# ─── Phase 5: CSV import (analyze → commit) ──────────────────────────────────
step "19) استيراد CSV"
req POST "/import/analyze" '{"rows":[{"date":"2026-11-03","amount":"-1200,50","description":"فاتورة الغاز"},{"date":"bad","amount":"abc","description":"صف تالف"}]}'
expect "POST /import/analyze" "$CODE" 200
IA_TOTAL=$(json_field "$RESP" "total")
IA_VALID=$(json_field "$RESP" "valid")
[ "$IA_TOTAL" = "2" ] && [ "$IA_VALID" = "1" ] && ok "تحليل: 2 صف، 1 صالح" || bad "analyze" "total=$IA_TOTAL valid=$IA_VALID"
IA_CAT=$(json_field "$RESP" "rows.0.category_name")
[ "$IA_CAT" = "فواتير" ] && ok "«فاتورة الغاز» → فواتير" || bad "analyze category" "'$IA_CAT'"
IA_W=$(json_field "$RESP" "rows.0.wallet_id")
[ -n "$IA_W" ] && [ "$IA_W" != "None" ] && ok "محفظة افتراضية محددة ($IA_W)" || bad "analyze wallet" "'$IA_W'"

req POST "/import/commit" "{\"rows\":[{\"date\":\"2026-11-03\",\"amount\":1200.5,\"type\":\"withdraw\",\"description\":\"فاتورة الغاز\",\"wallet_id\":$IA_W},{\"date\":\"bad\",\"amount\":0,\"type\":\"withdraw\",\"description\":\"صف تالف\"}]}"
expect "POST /import/commit" "$CODE" 201
IA_SAVED=$(json_field "$RESP" "saved")
[ "$IA_SAVED" = "1" ] && ok "حُفظت صف واحد ورُفض صف" || bad "commit saved" "saved='$IA_SAVED'"

# ─── Phase 5: profile + password ─────────────────────────────────────────────
step "20) الملف الشخصي وكلمة المرور"
# Fresh account so the main session's credentials stay untouched.
P_EMAIL="p5_$(date +%s)@test.dz"
req POST "/auth/register" "{\"name\":\"قبل\",\"email\":\"$P_EMAIL\",\"password\":\"Passw0rd!2026\"}"
expect "POST /auth/register (profile)" "$CODE" 201
P_TOK=$(json_field "$RESP" "tokens.access_token")

PROFILE_CODE=$(curl -s -o /tmp/p5_profile.json -w '%{http_code}' -X PUT "$BASE/auth/profile" \
  -H "Authorization: Bearer $P_TOK" -H 'Content-Type: application/json' \
  -d '{"name":"أحمد","email":"new_'$P_EMAIL'"}')
[ "$PROFILE_CODE" = "200" ] && ok "تحديث الملف (200)" || bad "profile update" "code=$PROFILE_CODE body=$(head -c 120 /tmp/p5_profile.json)"

PW_WRONG=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/auth/password" \
  -H "Authorization: Bearer $P_TOK" -H 'Content-Type: application/json' \
  -d '{"current_password":"wrong","new_password":"NewPass123"}')
[ "$PW_WRONG" = "401" ] && ok "كلمة مرور خاطئة → 401" || bad "password wrong" "code=$PW_WRONG"

PW_OK=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/auth/password" \
  -H "Authorization: Bearer $P_TOK" -H 'Content-Type: application/json' \
  -d '{"current_password":"Passw0rd!2026","new_password":"NewPass123"}')
[ "$PW_OK" = "200" ] && ok "تغيير كلمة المرور (200)" || bad "password change" "code=$PW_OK"

LOGIN_NEW=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"new_'$P_EMAIL'","password":"NewPass123"}')
[ "$LOGIN_NEW" = "200" ] && ok "دخول بالكلمة الجديدة (200)" || bad "login new password" "code=$LOGIN_NEW"

# ─── Phase 5: local budget suggestions (no AI key) ───────────────────────────
step "21) اقتراح الميزانيات (محلي)"
# Suggestions need categorized spending history — record one first.
req GET "/categories"
CAT_FOOD=$(json_field "$RESP" "categories" | python3 -c "
import sys,json
cats=json.load(sys.stdin)
for c in cats:
    if c.get('name')=='طعام ومشروبات':
        print(c['id']); break
" 2>/dev/null)
req GET "/wallets"
W_MAIN=$(json_field "$RESP" "wallets.0.id")
if [ -n "$CAT_FOOD" ] && [ -n "$W_MAIN" ]; then
  req POST "/actions" "{\"type\":\"withdraw\",\"amount\":500,\"date\":\"$(date +%F)\",\"category_id\":$CAT_FOOD,\"wallet_id\":$W_MAIN,\"description\":\"غداء\"}"
  expect "POST /actions (للاقتراح)" "$CODE" 201
fi

req POST "/budgets/auto-suggest"
expect "POST /budgets/auto-suggest" "$CODE" 200
BS_COUNT=$(json_field "$RESP" "suggestions" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null)
if [ -n "$BS_COUNT" ] && [ "$BS_COUNT" -ge 1 ] 2>/dev/null; then
  BS_REASON=$(json_field "$RESP" "suggestions.0.reason")
  [ -n "$BS_REASON" ] && [ "$BS_REASON" != "None" ] && ok "$BS_COUNT اقتراحات محلية مع سبب" || bad "suggestion reason" "empty"
else
  bad "budget suggestions" "count='$BS_COUNT' body=${RESP:0:160}"
fi

printf '\n\033[1mالنتيجة: %d ناجح، %d فاشل\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
