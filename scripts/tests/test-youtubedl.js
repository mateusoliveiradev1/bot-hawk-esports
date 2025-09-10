const YTDlpWrap = require('yt-dlp-wrap').default;

async function testYtDlp() {
  console.log('🔍 Testing yt-dlp-wrap...');

  const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  try {
    console.log(`📹 Testing URL: ${testUrl}`);

    const ytDlp = new YTDlpWrap();

    const stdout = await ytDlp.execPromise([
      testUrl,
      '--dump-single-json',
      '--no-check-certificates',
      '--no-warnings',
      '--prefer-free-formats',
      '--add-header',
      'referer:youtube.com',
      '--add-header',
      'user-agent:googlebot',
      '--format',
      'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
    ]);

    const info = JSON.parse(stdout);

    console.log('✅ yt-dlp-wrap success!');
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
    console.error('❌ yt-dlp-wrap failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testYtDlp();
