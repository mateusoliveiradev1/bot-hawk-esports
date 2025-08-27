const youtubedl = require('youtube-dl-exec');

async function testYoutubeDl() {
  console.log('🔍 Testing youtube-dl-exec...');
  
  const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  
  try {
    console.log(`📹 Testing URL: ${testUrl}`);
    
    const info = await youtubedl(testUrl, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot'],
      format: 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio'
    });
    
    console.log('✅ youtube-dl-exec success!');
    console.log('📊 Video info:');
    console.log(`  Title: ${info.title}`);
    console.log(`  Duration: ${info.duration}`);
    console.log(`  URL: ${info.url ? 'Found' : 'Not found'}`);
    
    if (info.formats && info.formats.length > 0) {
      console.log(`  Formats available: ${info.formats.length}`);
      const audioFormats = info.formats.filter(f => f.acodec && f.acodec !== 'none');
      console.log(`  Audio formats: ${audioFormats.length}`);
      
      if (audioFormats.length > 0) {
        console.log(`  Best audio format: ${audioFormats[0].format_id} (${audioFormats[0].ext})`);
        console.log(`  Audio URL: ${audioFormats[0].url ? 'Available' : 'Not available'}`);
      }
    }
    
  } catch (error) {
    console.error('❌ youtube-dl-exec failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testYoutubeDl();