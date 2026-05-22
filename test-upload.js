const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function testUpload() {
  try {
    // Create a test image (1x1 red pixel PNG)
    const testImage = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
      'base64'
    );
    
    // Save to temp file
    fs.writeFileSync('/tmp/test.png', testImage);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', fs.createReadStream('/tmp/test.png'), {
      filename: 'test.png',
      contentType: 'image/png'
    });
    
    console.log('Uploading to http://localhost:3334/api/upload-image...');
    
    // Upload
    const response = await fetch('http://localhost:3334/api/upload-image', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });
    
    console.log('Response status:', response.status);
    
    const text = await response.text();
    console.log('Response body:', text);
    
    if (response.ok) {
      const data = JSON.parse(text);
      console.log('\n✅ SUCCESS!');
      console.log('URL:', data.url);
      console.log('Size:', data.size);
      console.log('Type:', data.type);
    } else {
      console.log('\n❌ FAILED!');
      console.log('Error:', text);
    }
    
    // Cleanup
    fs.unlinkSync('/tmp/test.png');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
  }
}

testUpload();
