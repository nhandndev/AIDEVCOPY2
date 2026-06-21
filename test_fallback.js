const API_KEY = 'sk-hlY7GTxBZZooeSqYFXOmJzpaaFgteLOWR6WWpUdYuK3hFBz1';
const API_URL = 'https://api.shopaikey.com/v1/chat/completions';

async function testModel(modelName) {
  const payload = {
    model: modelName,
    messages: [{ role: 'user', content: 'test' }],
    temperature: 0.3
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify(payload)
  });

  console.log(`Model: ${modelName}, Status: ${response.status}`);
}

async function run() {
  await testModel('gemini-1.5-flash');
  await testModel('gpt-3.5-turbo');
}
run();
