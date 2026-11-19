# Build APK production

Build APK release Android yang bisa diinstal langsung dan dibagikan lewat WhatsApp:

```bash
cd apps/mobile
npm run build:prod
```

Script menjalankan `android/gradlew :app:assembleRelease` langsung di komputer lokal. Setiap build menaikkan `expo.version` (patch) dan `expo.android.versionCode` di `app.json`. APK release ditandatangani dengan release keystore lokal dan disalin ke:

```text
android/app/build/outputs/apk/release/Absensi-Guru-v<versi>.apk
```

Pada build pertama, script membuat release keystore lokal secara otomatis. Simpan **kedua** file berikut di backup pribadi yang aman agar APK berikutnya dapat dipasang sebagai update aplikasi yang sama; jangan commit atau bagikan:

```text
android/app/absensi-release.keystore
android/keystore.properties
```

Kirim file APK versi bernama di atas lewat WhatsApp sebagai dokumen/file. Penerima mungkin perlu mengizinkan instalasi dari sumber tersebut di Android.
