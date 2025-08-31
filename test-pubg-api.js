const axios = require('axios');
require('dotenv').config();

console.log('Testing PUBG API functionality...');

const apiKey = process.env.PUBG_API_KEY;
console.log('API Key configured:', !!apiKey);

if (!apiKey) {
  console.log('❌ PUBG_API_KEY not found in environment variables');
  process.exit(1);
}

// Test 1: API Status
console.log('\n1. Testing API Status...');
axios.get('https://api.pubg.com/status', {
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/vnd.api+json'
  },
  timeout: 10000
})
.then(response => {
  console.log('✅ API Status: OK');
  
  // Test 2: Player Search (using a common test player name)
  console.log('\n2. Testing Player Search...');
  return axios.get('https://api.pubg.com/shards/steam/players?filter[playerNames]=shroud', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/vnd.api+json'
    },
    timeout: 10000
  });
})
.then(response => {
  console.log('✅ Player Search: OK');
  console.log('Players found:', response.data.data.length);
  
  // Test 3: Seasons endpoint
  console.log('\n3. Testing Seasons endpoint...');
  return axios.get('https://api.pubg.com/shards/steam/seasons', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/vnd.api+json'
    },
    timeout: 10000
  });
})
.then(response => {
  console.log('✅ Seasons endpoint: OK');
  console.log('Seasons available:', response.data.data.length);
  
  console.log('\n🎉 All PUBG API tests passed successfully!');
  console.log('\n📊 API Functionality Status:');
  console.log('- ✅ API Connection: Working');
  console.log('- ✅ Player Search: Working');
  console.log('- ✅ Seasons Data: Working');
  console.log('- ✅ Authentication: Valid');
})
.catch(error => {
  console.log('\n❌ PUBG API test failed');
  console.log('Error:', error.response?.status || error.code);
  console.log('Message:', error.message);
  
  if (error.response?.status === 401) {
    console.log('\n🔑 Authentication Error: Invalid API Key');
  } else if (error.response?.status === 429) {
    console.log('\n⏰ Rate Limit: Too many requests');
  } else if (error.response?.status === 404) {
    console.log('\n🔍 Not Found: Endpoint or resource not available');
  }
  
  if (error.response?.data) {
    console.log('\nFull error response:', JSON.stringify(error.response.data, null, 2));
  }
});