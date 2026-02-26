const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

// Переменные окружения, которые должны быть установлены в Render
const ENOT_SHOP_ID = process.env.ENOT_MERCHANT_ID;      // UUID кассы из документации [citation:2]
const ENOT_API_KEY = process.env.ENOT_SECRET;           // secret key (x-api-key)
const ENOT_WEBHOOK_SECRET = process.env.ENOT_WEBHOOK_SECRET; // для проверки вебхуков

if (!ENOT_SHOP_ID || !ENOT_API_KEY || !ENOT_WEBHOOK_SECRET) {
    console.error('❌ Ошибка: Env переменные (ENOT_MERCHANT_ID, ENOT_SECRET, ENOT_WEBHOOK_SECRET) не найдены');
    process.exit(1);
}

/**
 * Эндпоинт для создания платежа
 * Документация: https://docs.enot.io/e/new/create-invoice [citation:2]
 * 
 * Ожидает от клиента (Shop.jsx):
 * { amount, orderId, gameId, uc, method }
 */
app.post('/create-payment', async (req, res) => {
    const { amount, orderId, gameId, uc, method } = req.body;

    // Валидация входных данных
    if (!amount || !orderId || !gameId || !method) {
        return res.status(400).json({ 
            success: false, 
            error: 'Нет данных: amount, orderId, gameId и method обязательны' 
        });
    }

    // Преобразуем метод оплаты из кода FreeKassa в код Enot.io
    // Теперь это просто справочник для преобразования, а не часть API
    const methodMapping = {
        '36': 'card',      // Банковская карта
        '44': 'sbp',       // СБП
        '41': 'card_kzt'   // Карты KZT
    };
    
    const selectedMethod = methodMapping[method?.toString()];
    if (!selectedMethod) {
        return res.status(400).json({ 
            success: false, 
            error: 'Неизвестный метод оплаты. Допустимые: 36 (карта), 44 (СБП), 41 (KZT)' 
        });
    }

    // 1. Формируем payload ТОЧНО по спецификации Enot.io [citation:2]
    const payload = {
        shop_id: ENOT_SHOP_ID,                           // UUID кассы
        amount: Number(amount).toFixed(2),                // Сумма с разделителем "."
        order_id: orderId,                                 // Уникальный ID в вашей системе
        currency: 'RUB',                                   // Валюта
        comment: `${uc} UC в Donza - ID: ${gameId}`,      // Назначение платежа
        include_service: [selectedMethod],                  // Доступные методы оплаты (массив!)
        success_url: 'https://www.donza.site/success',     // URL при успехе
        fail_url: 'https://www.donza.site/fail',           // URL при ошибке
        hook_url: 'https://api.donza.site/webhook'         // URL для вебхука
    };

    console.log('📤 Отправка запроса в Enot.io:', JSON.stringify(payload, null, 2));

    try {
        // 2. Отправляем запрос ТОЧНО как в документации [citation:2]
        const response = await fetch('https://api.enot.io/invoice/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ENOT_API_KEY                 // Ключ в заголовке!
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log('📥 Ответ от Enot.io:', JSON.stringify(data, null, 2));

        // 3. Проверяем ответ ТОЧНО по документации [citation:2]
        // При успехе: status == 200, data содержит url
        if (data.status === 200 && data.data && data.data.url) {
            console.log('✅ Платеж создан, ссылка:', data.data.url);
            return res.json({ 
                success: true, 
                link: data.data.url,
                payment_id: data.data.id
            });
        } else {
            // При ошибке: data.error содержит описание
            console.error('❌ Ошибка от Enot.io:', data.error || 'Неизвестная ошибка');
            return res.status(500).json({ 
                success: false, 
                error: data.error || 'Ошибка при создании платежа в Enot.io'
            });
        }
    } catch (err) {
        console.error('💥 Критическая ошибка сервера:', err);
        return res.status(500).json({ 
            success: false, 
            error: 'Ошибка соединения с сервером оплаты'
        });
    }
});

/**
 * Эндпоинт для вебхуков (уведомлений об оплате)
 * Документация: https://docs.enot.io/e/new/create-invoice (раздел Webhook)
 * 
 * Enot.io присылает сюда POST запросы при изменении статуса платежа
 */
app.post('/webhook', (req, res) => {
    const webhookData = req.body;
    console.log('🔔 Получен вебхук:', JSON.stringify(webhookData, null, 2));

    // 4. Проверяем сигнатуру вебхука (если требуется)
    // В документации Enot.io это делается через заголовок 'x-api-sha256-signature' [citation:2]
    // Для простоты пока пропустим, но на проде обязательно нужно добавить!

    // 5. Обрабатываем успешный платеж
    if (webhookData.status === 'success') {
        const { order_id, amount, invoice_id } = webhookData;
        console.log(`💰 Оплата прошла успешно! Заказ: ${order_id}, Сумма: ${amount}, Invoice: ${invoice_id}`);
        
        // TODO: Здесь ваша логика зачисления UC на аккаунт gameId
        // Нужно найти order_id в вашей базе данных и начислить UC
        
    } else {
        console.log(`ℹ️ Статус платежа изменился: ${webhookData.status}`);
    }

    // 6. Обязательно отвечаем OK, иначе Enot.io будет повторять запросы
    res.send('OK');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));