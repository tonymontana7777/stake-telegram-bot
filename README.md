# Stake Telegram Bot

Bu bot, Google Sheets'teki güncel çevrim listesini okur ve Telegram grubunda `!stake` yazıldığında **ilk 10 kişiyi** otomatik olarak cevaplar.

## Çıktı formatı

```text
STAKE 24.09.2026 3000💵 ÖDÜLLÜ GÜNCEL ÇEVRİM LİSTESİ

1. De**8 $63,284.59 -$800

2. Ah**n $59,419.15 -$500

3. Pu**i $51,104.79 -$400

...

10. Ya**7 $11,569.07 -$25

!stake
```

İsimler otomatik olarak `De**8` biçiminde gizlenir. Liste çevrim tutarına göre büyükten küçüğe sıralanır ve ödüller sırasıyla:

`800, 500, 400, 350, 300, 250, 200, 100, 75, 25`

Toplam ödül: **$3000**

## Google Sheets

Bot şu tabloyu kullanacak şekilde hazırdır:

- Sheet ID: `1TECdVKOeytYv4a2zkXTOJ79nHP9umzc41gyO0KHMKSk`
- GID: `235680015`

Tablonun **Bağlantıya sahip olan herkes görüntüleyebilir** olması gerekir. Bot her `!stake` komutunda Sheet'i yeniden okur; ayrı bir manuel güncelleme gerekmez.

## Telegram BotFather ayarı

`!stake` normal mesaj olduğu için botun gruptaki mesajları görebilmesi gerekir.

BotFather'da:

1. `/setprivacy`
2. Botu seç
3. **Disable**

Alternatif olarak `/stake` komutu da desteklenir.

## Render kurulumu

1. Render'da **New > Web Service** aç.
2. GitHub'dan `stake-telegram-bot` reposunu seç.
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. Environment bölümüne sadece şu gizli değişkeni ekle:
   - `TELEGRAM_BOT_TOKEN` = BotFather tokenın
6. Deploy et.

Render otomatik olarak `RENDER_EXTERNAL_URL` sağlar. Uygulama açıldığında Telegram webhook'u kendisi kurar.

Sağlık kontrolü: `/health`

## Not

Repo içindeki `render.yaml` Starter planına göre hazırlanmıştır; bu plan servis uyumasın diye tercih edilmiştir. Free plan kullanılırsa Render uzun süre gelen istek olmazsa servisi uyutabilir ve ilk `!stake` yanıtı gecikebilir.
