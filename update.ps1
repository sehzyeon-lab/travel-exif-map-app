# 앱 업데이트 스크립트
# 코드 수정 후 이 스크립트만 실행하면 앱이 자동 업데이트됩니다

Write-Host "🔨 빌드 중..." -ForegroundColor Cyan
npm run build

Write-Host "🚀 Vercel 배포 중..." -ForegroundColor Cyan
vercel --prod --yes

Write-Host "✅ 업데이트 완료! 앱을 다시 열면 자동 반영됩니다." -ForegroundColor Green
