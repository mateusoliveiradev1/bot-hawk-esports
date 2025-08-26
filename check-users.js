const { PrismaClient } = require('@prisma/client');

async function checkUsers() {
  const prisma = new PrismaClient();
  
  try {
    // Check total users
    const totalUsers = await prisma.user.count();
    console.log(`Total de usuários: ${totalUsers}`);
    
    if (totalUsers > 0) {
      // Get first 5 users with basic info
      const users = await prisma.user.findMany({
        take: 5,
        select: {
          id: true,
          username: true,
          level: true,
          xp: true,
          coins: true,
          pubgUsername: true,
          pubgPlatform: true,
          createdAt: true
        }
      });
      
      console.log('\nPrimeiros 5 usuários:');
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.username} (ID: ${user.id})`);
        console.log(`   Level: ${user.level}, XP: ${user.xp}, Coins: ${user.coins}`);
        console.log(`   PUBG: ${user.pubgUsername || 'Não configurado'} (${user.pubgPlatform || 'N/A'})`);
        console.log(`   Criado em: ${user.createdAt}\n`);
      });
      
      // Check guilds
      const totalGuilds = await prisma.guild.count();
      console.log(`Total de servidores: ${totalGuilds}`);
      
      if (totalGuilds > 0) {
        const guilds = await prisma.guild.findMany({
          take: 3,
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                users: true
              }
            }
          }
        });
        
        console.log('\nServidores:');
        guilds.forEach((guild, index) => {
          console.log(`${index + 1}. ${guild.name} (ID: ${guild.id})`);
          console.log(`   Usuários: ${guild._count.users}\n`);
        });
      }
    } else {
      console.log('\nNenhum usuário encontrado no banco de dados.');
      console.log('Para testar o ranking, você precisa:');
      console.log('1. Registrar usuários usando comandos do bot');
      console.log('2. Usar /register para criar perfis PUBG');
      console.log('3. Interagir com o bot para gerar dados de atividade');
    }
    
  } catch (error) {
    console.error('Erro ao consultar banco:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();