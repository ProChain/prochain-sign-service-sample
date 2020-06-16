const app = require('express')()
const http = require('http').Server(app)
const { Router } = require('express')
const log4js = require('log4js')
const { blake2AsHex } = require('@polkadot/util-crypto')
const Keyring = require('@polkadot/keyring').default
const { ApiPromise, WsProvider } = require('@polkadot/api')
const bs58 = require('bs58')
const port = process.env.SERVER_PORT || 8088
const WS_PROVIDER = process.env.SUBSTRATE_HOST|| 'ws://127.0.0.1:9944'
const provider = new WsProvider(WS_PROVIDER)
const bodyParser = require('body-parser')
var types = require('./prochain.json')
log4js.configure({
  appenders: {
    out: { type: 'console' },
    log_file: {
      type: 'dateFile',
      filename: './logs/log_file',
      pattern: 'yyyy-MM-dd.log',
      alwaysIncludePattern: true
    },
  },
  categories: {
    default: {
      appenders: ['out', 'log_file'],
      level: 'debug'
    }
  }
})
const logger = log4js.getLogger()
const entry = async()=>{
    const api = await createApi()
    app.use(
        bodyParser.json({
            limit: '100kb'
        })
    )
    
    app.use(
        bodyParser.urlencoded({
            extended: false
        })
    )
    app.post('/sign', async function (req, res) {
        var adid = req.body['adid']
        var did = req.body['did']
        let trx = await sign(api,'ads', 'distribute', [adid, didToHex(did)])
        res.send({"result":trx})
    })
}
// # subkey generate 
// # Secret phrase `own buyer ketchup job divert stumble recipe there pair fever blade luggage` is account:
// # Secret seed: 0x00b5d4459e1c317b7f2135f100bfb3b3c08018bfb667db1d60f77a35c291d136
// # Public key (hex): 0x56636f4d7f50bc59057ad237695645cb82da13268c7ee7409eb52eee17e97468
// # Address (SS58): 5E1yWjp99JPKa8jdPTxrC2WeWkyBAFBPbXEdVhrhvPvNtbis
async function createApi(){
    const api =await ApiPromise.create({
        provider,
        types:types
    })
    return api
}
async function sign(api,module, method, parameters) {
    try {
        const res = process.env.SECRET_SEED
        const keyring = new Keyring({ type: 'sr25519' })
        const seed = res.toString().replace(/[\r\n]/g, '')
        const pair = keyring.addFromMnemonic(seed)
        const { nonce } = await api.query.system.account(process.env.ADDRESS);
        const utx = api.tx[module][method](...parameters).sign(pair, { nonce })
        const trxHash = utx.hash.toHex()
        await utx.send(({ events = [], status }) => {
            if (status.type === 'Future' || status.type === 'Invalid') {
                logger.warn('future or invalid',parameters)
            }else if(status.isInBlock){
                logger.info('inblock',parameters)
            }else if(status.isFinalized){
                let isSuccessful = true
                events.forEach(({ phase, event: { data, method, section } }) => {
                  logger.info(
                    '\t',
                    phase.toString(),
                    `: ${section}.${method}`,
                    data.toString()
                  )
                if (method.includes('ExtrinsicFailed')) isSuccessful = false
                logger.info('transaction ',isSuccessful,parameters)
            })}
        })
        return trxHash
    } catch (error) {
        logger.error(error)
        return "error"
    }
}

http.listen(port, function () {
    logger.info('listening on *:' + port)
})

function didToHex(did) {
    const bytes = bs58.decode(did.substring(8))
    return blake2AsHex(bytes, 256)
}

function hexToDid(hex) {
    const bytes = Buffer.from(hex.slice(2), 'hex')
    const address = bs58.encode(bytes)
    const did = `did:pra:${address}`
    return did
}
entry().catch(console.log)