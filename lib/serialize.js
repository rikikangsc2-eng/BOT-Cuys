const { proto, getContentType } = require('@whiskeysockets/baileys');
const { getBuffer } = require('./functions');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const fileType = require('file-type');
const config = require('../config');
const { addToQueue } = require('./connectionManager');
const logger = require('./logger');

function queueMessage(jid, content, options = {}) {
    return addToQueue({ jid, content, options });
}

exports.serialize = async (sock, m) => {
    if (!m) return m;
    
    const M = proto.WebMessageInfo.fromObject(m);

    M.isGroup = M.key.remoteJid.endsWith('@g.us');
    M.from = M.key.remoteJid;
    M.fromMe = M.key.fromMe;
    M.sender = M.fromMe ? (sock.user.id.split(':')[0] + '@s.whatsapp.net' || sock.user.id) : (M.key.participant || M.key.remoteJid);
    M.pushName = M.pushName || 'User';

    if (M.message) {
        M.type = getContentType(M.message);
        M.msg = (M.type === 'viewOnceMessage' || M.type === 'viewOnceMessageV2') 
            ? M.message[M.type].message[getContentType(M.message[M.type].message)] 
            : M.message[M.type];
        
        M.body = M.message.conversation ||
            M.msg?.text ||
            M.msg?.caption ||
            (M.type === 'listResponseMessage' && M.msg?.singleSelectReply?.selectedRowId) ||
            (M.type === 'buttonsResponseMessage' && M.msg?.selectedButtonId) ||
            (M.type === 'templateButtonReplyMessage' && M.msg?.selectedId) ||
            '';
            
        M.reply = (text, quoted = M) => {
            const jidRegex = /@(\d+)/g;
            const matches = text.matchAll(jidRegex);
            
            const content = { text };
            
            const mentions = [...matches].map(match => `${match[1]}@s.whatsapp.net`);
            if (mentions.length > 0) {
                content.mentions = mentions;
            }

            const options = { quoted, sendTyping: true };
            
            return queueMessage(M.from, content, options);
        };
        
        M.sticker = async (media, quoted = M) => {
            try {
                const buffer = await getBuffer(media);
                const sticker = new Sticker(buffer, {
                    pack: config.packName,
                    author: `${M.pushName} | ${config.botName}`,
                    type: StickerTypes.FULL,
                    quality: 50
                });
                const stickerBuffer = await sticker.toBuffer();
                return queueMessage(M.from, { sticker: stickerBuffer }, { quoted });
            } catch (error) {
                logger.error(error, "Gagal membuat stiker");
                const errorMessage = error.message.includes('ffmpeg') 
                    ? 'Gagal membuat stiker dari video. FFmpeg tidak terinstal.'
                    : 'Gagal membuat stiker. Terjadi kesalahan internal.';
                return M.reply(errorMessage, quoted);
            }
        };
        
        M.media = async (caption, media, quoted = M) => {
            let data, options = {};
            if (!media) {
                media = caption;
                caption = '';
            }
            
            try {
                data = await getBuffer(media);
                const type = await fileType.fromBuffer(data) || { mime: 'application/octet-stream', ext: 'bin' };

                if (/image/.test(type.mime)) {
                    options = { image: data, caption };
                } else if (/video/.test(type.mime)) {
                    options = { video: data, caption };
                } else if (/audio/.test(type.mime)) {
                    options = { audio: data, mimetype: 'audio/mp4' };
                } else {
                    options = { document: data, mimetype: type.mime, fileName: `${caption || Date.now()}.${type.ext}` };
                }
                
                return queueMessage(M.from, options, { quoted });
            } catch (e) {
                logger.error(e, "Error di m.media");
                return M.reply(`Gagal memproses media: ${e.message}`, quoted);
            }
        };
    }
    
    return M;
};