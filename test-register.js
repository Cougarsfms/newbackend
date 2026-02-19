// Quick test script to register a user
const axios = require('axios');

async function registerUser() {
    try {
        const response = await axios.post('http://localhost:3000/api/customer/auth/register', {
            phoneNumber: '+919876543210',
            name: 'Test User'
        });
        console.log('✅ User registered successfully!');
        console.log('Response:', JSON.stringify(response.data, null, 2));
        console.log('\n📱 Now you can login with:');
        console.log('   Phone: +919876543210');
        console.log('   OTP: 123456');
    } catch (error) {
        if (error.response) {
            console.log('❌ Error:', error.response.data);
        } else {
            console.log('❌ Error:', error.message);
        }
    }
}

registerUser();
