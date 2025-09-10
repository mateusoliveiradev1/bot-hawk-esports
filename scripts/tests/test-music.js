const { search, video_basic_info, stream_from_info } = require('play-dl');

async function testMusic() {
  console.log('🎵 Testando busca de música...');

  try {
    // Teste 1: Busca por texto
    console.log('\n1. Testando busca por texto: "denji chainsaw man"');
    const searchResults = await search('denji chainsaw man', {
      limit: 1,
      source: { youtube: 'video' },
    });

    if (searchResults.length > 0) {
      const video = searchResults[0];
      console.log('✅ Resultado encontrado:');
      console.log(`   Título: ${video.title}`);
      console.log(`   Canal: ${video.channel?.name}`);
      console.log(`   URL: ${video.url}`);
      console.log(`   Duração: ${video.durationInSec}s`);

      // Teste 2: Obter informações do vídeo
      console.log('\n2. Testando obtenção de informações do vídeo...');
      const videoInfo = await video_basic_info(video.url);
      console.log('✅ Informações obtidas:');
      console.log(`   ID: ${videoInfo.video_details.id}`);
      console.log(`   Título: ${videoInfo.video_details.title}`);
      console.log(`   Canal: ${videoInfo.video_details.channel?.name}`);

      // Teste 3: Tentar criar stream
      console.log('\n3. Testando criação de stream...');
      try {
        const stream = await stream_from_info(videoInfo, { quality: 2 });
        if (stream && stream.stream) {
          console.log('✅ Stream criado com sucesso (qualidade alta)');
          stream.stream.destroy(); // Limpar o stream
        } else {
          console.log('❌ Falha ao criar stream (qualidade alta)');

          // Tentar qualidade média
          const streamMed = await stream_from_info(videoInfo, { quality: 1 });
          if (streamMed && streamMed.stream) {
            console.log('✅ Stream criado com sucesso (qualidade média)');
            streamMed.stream.destroy();
          } else {
            console.log('❌ Falha ao criar stream (qualidade média)');
          }
        }
      } catch (streamError) {
        console.log('❌ Erro ao criar stream:', streamError.message);
      }
    } else {
      console.log('❌ Nenhum resultado encontrado na busca');
    }
  } catch (error) {
    console.log('❌ Erro no teste:', error.message);
    console.log('Stack:', error.stack);
  }
}

testMusic()
  .then(() => {
    console.log('\n🏁 Teste concluído');
    process.exit(0);
  })
  .catch(error => {
    console.log('💥 Erro fatal:', error);
    process.exit(1);
  });
