const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function testYtDlp() {
  console.log('🔍 Testing yt-dlp functionality...');
  
  const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll for testing
  
  try {
    console.log(`📺 Testing URL: ${testUrl}`);
    
    // Test yt-dlp command
    const ytDlpCommand = `python -m yt_dlp -f "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio" --get-url "${testUrl}"`;
    console.log(`🔧 Running: ${ytDlpCommand}`);
    
    const { stdout, stderr } = await execAsync(ytDlpCommand, { timeout: 30000 });
    
    if (stderr && !stderr.includes('WARNING')) {
      console.error(`❌ yt-dlp stderr: ${stderr}`);
      return false;
    }
    
    const audioUrl = stdout.trim();
    console.log(`✅ Audio URL extracted: ${audioUrl.substring(0, 100)}...`);
    
    if (!audioUrl || !audioUrl.startsWith('http')) {
      console.error(`❌ Invalid audio URL: ${audioUrl}`);
      return false;
    }
    
    console.log('✅ yt-dlp test successful!');
    return true;
    
  } catch (error) {
    console.error(`❌ yt-dlp test failed: ${error.message}`);
    return false;
  }
}

// Run the test
testYtDlp().then(success => {
  if (success) {
    console.log('🎉 yt-dlp is working correctly!');
  } else {
    console.log('💥 yt-dlp test failed!');
  }
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(1);
});