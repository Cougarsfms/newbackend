const https = require('https');

const postData = JSON.stringify({
  message: 'Yes, proceed with booking.',
  confirmAction: {
    type: 'create_booking',
    details: {
      serviceId: 'svc_3',
      date: '2026-08-15T10:00:00.000Z',
      addressId: '66262c83-389e-4c8e-ac50-bdd74840fb9a',
      durationMinutes: 60
    }
  }
});

const options = {
  hostname: 'gyors-backend-311476989793.us-central1.run.app',
  path: '/api/customer-concierge/customer/c2c02198-3c7d-4431-9ed5-3dd5df11a4e9/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response Payload:', JSON.stringify(JSON.parse(data), null, 2));
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();
