# Stake Telegram Bot & Yönetim Paneli (Render 7/24)

Bu proje, Stake günlük çevrim listesini otomatik yöneten, Google Sheets'ten güncel verileri çeken ve saat **21:00**'da Telegram'a gönderen tam teşekküllü bir bot ve web yönetim panelidir.

---

## 💎 Render Ücretli (Starter / Standard) Planı ile 7/24 Kurulum

Render'ın ücretli planında servis **asla uyumaz**, arka planda kesintisiz 7/24 çalışır ve zamanlanmış görevleri (21:00 gönderimini) kusursuz icra eder.

### 1. Adım: Render'a Giriş Yapın
1. [dashboard.render.com](https://dashboard.render.com) adresine gidin.
2. GitHub hesabınızla giriş yapın.

### 2. Adım: Yeni Web Service Oluşturun
1. Dashboard'da **"New +"** butonuna tıklayıp **"Web Service"** seçin.
2. Listeden **`stake-telegram-bot`** reponuzu seçin.

### 3. Adım: Yapılandırma
Aşağıdaki ayarları kontrol edin:
- **Name:** `stake-telegram-bot`
- **Region:** `Frankfurt (EU Central)`
- **Branch:** `main`
- **Runtime:** `Node`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Instance Type:** **`Starter`** (7/24 kesintisiz, sıfır uyku süresi)

### 4. Adım (İsteğe Bağlı ama Önerilen): Kalıcı Disk (Persistent Disk)
Bot ayarlarınızın ve geçmiş loglarınızın her deploy veya yeniden başlatmada korunması için:
- Service ayarlarında **"Disks"** sekmesine gelin.
- **Add Disk**:
  - Name: `bot-data`
  - Mount Path: `/var/data`
  - Size: `1 GB` (En küçük boyut fazlasıyla yeterlidir)

### 5. Adım: "Create Web Service" Butonuna Basın
Render uygulamanızı birkaç dakika içinde kuracak ve size `https://stake-telegram-bot.onrender.com` gibi 7/24 erişebileceğiniz canlı panel adresinizi teslim edecektir!
