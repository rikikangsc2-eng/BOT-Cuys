const logger = require('./logger');
const { LRUCache } = require('lru-cache');

let isConnected = false;
const messageQueue = new LRUCache({ max: 5000 });
let isProcessing = false;
let jobCounter = 0;

function setConnectionStatus(status) {
    isConnected = status;
    logger.info(`Status Koneksi WhatsApp diatur ke: ${status}`);
    if (isConnected && !isProcessing) {
        processQueue();
    }
}

function isWhatsAppConnected() {
    return isConnected;
}

function addToQueue(job) {
    return new Promise((resolve, reject) => {
        const jobId = jobCounter++;
        job.resolve = resolve;
        job.reject = reject;
        messageQueue.set(jobId, job);
        logger.info(`Pesan [ID: ${jobId}] ditambahkan. Total antrean: ${messageQueue.size}`);
        if (isConnected && !isProcessing) {
            processQueue();
        }
    });
}

let sockInstance = null;
function setSocket(sock) {
    sockInstance = sock;
}

async function processQueue() {
    if (isProcessing || messageQueue.size === 0 || !isConnected || !sockInstance) {
        return;
    }

    isProcessing = true;
    logger.info(`Memulai pemrosesan antrean (${messageQueue.size} pesan)...`);
    
    const jobsToProcess = [...messageQueue.entries()];
    messageQueue.clear();

    for (const [jobId, job] of jobsToProcess) {
        if (!isConnected) {
            logger.warn('Koneksi terputus, mengembalikan sisa pekerjaan ke antrean.');
            const remainingJobs = jobsToProcess.slice(jobsToProcess.indexOf([jobId, job]));
            for (const [remJobId, remJob] of remainingJobs) {
                messageQueue.set(remJobId, remJob);
            }
            break;
        }
        
        const { jid, content, options, resolve, reject } = job;
        try {
            if (options?.sendTyping) {
                 await sockInstance.sendPresenceUpdate('composing', jid);
            }
            
            await new Promise(res => setTimeout(res, 500));

            const sentMessage = await sockInstance.sendMessage(jid, content, options);
            logger.info(`Pesan [ID: ${jobId}] berhasil dikirim ke ${jid}.`);
            if (resolve) resolve(sentMessage);
        } catch (e) {
            logger.error(e, `Gagal mengirim pesan [ID: ${jobId}] ke ${jid}.`);
            if (reject) reject(e);
        }
    }
    
    isProcessing = false;
    logger.info('Siklus pemrosesan antrean selesai.');

    if (messageQueue.size > 0 && isConnected) {
        setTimeout(processQueue, 1000);
    }
}

module.exports = {
    setConnectionStatus,
    isWhatsAppConnected,
    addToQueue,
    processQueue,
    setSocket
};