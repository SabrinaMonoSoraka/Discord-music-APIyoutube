const { Client, Util } = require('discord.js');
const config = require('./config.json');
const ytdl = require("ytdl-core");
const YouTube = require('simple-youtube-api');
const youtube = new YouTube(config.ytb);
const queue = new Map();
const bot = new Client({ intents: [
 'GUILDS',
 'GUILD_MESSAGES',
 'GUILD_VOICE_STATES',
 'GUILD_MESSAGE_TYPING',
 'GUILD_INTEGRATIONS'
]});
const {
	NoSubscriberBehavior,
	StreamType,
	createAudioPlayer,
	createAudioResource,
	entersState,
	AudioPlayerStatus,
	VoiceConnectionStatus,
	joinVoiceChannel
} = require('@discordjs/voice');

const player = createAudioPlayer({
	behaviors: {
		noSubscriber: NoSubscriberBehavior.Play,
		maxMissedFrames: Math.round(8000 / 20) 
		 }
	});

bot.on("ready", () => console.log("Estou pronta"));

bot.on("messageCreate", async msg => { 
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(config.prefix)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(' ')[0];
	command = command.slice(config.prefix.length)

  if(command === 'play') {
      if(!msg.member.voice.channel) return msg.channel.send('Me desculpe, mas você precisa estar em um canal de voz para tocar música!');
		const voiceChannel = msg.member.voice.channel;
    if(!msg.member.voice.channel.permissionsFor(bot.user).has('CONNECT')) return msg.channel.send("**Não consigo me conectar ao seu canal de voz, verifique se tenho as permissões adequadas !!** :x:")
    if(!msg.member.voice.channel.permissionsFor(bot.user).has('SPEAK')) return msg.channel.send("**Eu não posso falar neste canal de voz, verifique se eu tenho as permissões adequadas !!** :x:")

		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id); 
				await handleVideo(video2, msg, voiceChannel, true); 
			}
			return msg.channel.send(`Adc Playlist: **${playlist.title}** foi bem adicionada a lista!`);
    	} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString, 10);
					let index = 0;
					msg.channel.send(`
__**Seleção**__

${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}

Escolha uma das músicas de 1-10
					`);
					try {
						const filter = msg2 => msg2.content > 0 && msg2.content < 11;
						var response = await msg.channel.awaitMessages({filter,
							max:1,
							time: 25000,
							errors: ['time']
            });
					} catch (err) {
						console.error(err);
						return msg.channel.send('Nenhum valor inserido ou está inválido , cancelando a operação de seleção de vídeo.');
					}
					const videoIndex = parseInt(response.first().content);
          var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
        

				} catch (err) {
					console.error(err);
					return msg.channel.send('🆘 Não consegui obter nenhum resultado de pesquisa.');
				}
			}
			return handleVideo(video, msg, voiceChannel);
		}
   	} else if (command === 'skip') {
  	if (!msg.member.voice.channel) return msg.channel.send('Você não está em um canal de voz');
		if (!serverQueue) return msg.channel.send('Não a nada tocando posso pular pra você');
		serverQueue.connection.stop();
		return undefined;
  	} else if (command === 'leave') {
		if (!msg.member.voice.channel) return msg.channel.send('Você não está em um canal de voz!');
		if (!serverQueue) return msg.channel.send('Não tá tocando eu não posso parar pra você');
		disconnectToChannel(serverQueue.voiceChannel);
		serverQueue.songs = [];
		queue.delete(msg.guild.id);
		return;
		return undefined;
	} else if (command === 'np') {
		if (!serverQueue) return msg.channel.send('Não a nada tocando.');
		return msg.channel.send(`Tocando: **${serverQueue.songs[0].title}**`);
	} else if (command === 'playlist') {
		if (!serverQueue) return msg.channel.send('Não a nada tocando.');
		i = 0;
		return msg.channel.send(`
__**Lista de Música:**__

${serverQueue.songs.map(song => `**${++i}** - ${song.title}`).join('\n')}

**Tocando Agora:** ${serverQueue.songs[0].title}
		`);
	} else if (command === 'pause') {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.pause();
			return msg.channel.send('⏸ Pausou');
		}
		return msg.channel.send('Não a nada tocando.');
	} else if (command === 'resume') {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.unpause();
			return msg.channel.send('▶ Rusumindo');
		}
		return msg.channel.send('Não a nada tocando.');
	}else if(command === 'loop'){
		if(!msg.member.voice.channel) return msg.channel.send('Você não está em um canal de voz!');
		if(!serverQueue) return msg.channel.send('Não a nada tocando.');
		  serverQueue.loop = !serverQueue.loop
		  return msg.channel.send(`Comando loop ${serverQueue.loop ? `**Ativado**`: `**Desativado**`}`);
	  }

	return undefined;
});


async function connectToChannel(channel) {
	const connection = joinVoiceChannel({
		channelId: channel.id,
		guildId: channel.guild.id,
		adapterCreator: channel.guild.voiceAdapterCreator,
	});
	try {
		await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
		return connection;
	} catch (error) {
		connection.destroy();
		throw error;
	}
	}
async function disconnectToChannel(channel) {
	const connection = joinVoiceChannel({
		channelId: channel.id,
		guildId: channel.guild.id,
		adapterCreator: channel.guild.voiceAdapterCreator,
	});
		connection.destroy();
		
	}
		

async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playlist: true,
			loop: false
		};
		queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			const connection = await connectToChannel(voiceChannel);
			connection.subscribe(player);
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`Eu não pude entrar no canal de voz: ${error}`);
			queue.delete(msg.guild.id);
			return msg.channel.send(`Eu não pude entrar no canal de voz: ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return msg.channel.send(`Agora **${song.title}** foi adicionado a lista!`);
	}
	return undefined;
}

async function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		disconnectToChannel(serverQueue.voiceChannel);
		queue.delete(guild.id);
		return;
	}

	serverQueue.textChannel.send(`Tocando: **${song.title}**`);

	const stream = ytdl(song.url, {filter : 'audioonly'});
	const resource = createAudioResource(stream, {
		inputType: StreamType.Arbitrary
	});
	player.play(resource);
	entersState(player, AudioPlayerStatus.Playing, 5e3);
	player.on(AudioPlayerStatus.Idle,async () => {
	    if(!serverQueue.loop) serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
	});
	
	if(serverQueue.connection === null){
		serverQueue.connection = resource.audioPlayer;
	}
	
}



bot.login(config.token);