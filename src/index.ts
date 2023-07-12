import { KeyPair, Noble } from "@cmdcode/crypto-utils"
import { Address, Script, Signer, Tap, Tx } from "@cmdcode/tapscript"
import { Buffer } from "buffer"

type RunParams = {
    log: (message: string) => void,
    address: string,
    mimetype?: string,
    text?: string,
    files?: File[],
    padding?: number,
    tip?: number,
    tippingAddress: string,
    privkey?: string,
    network?: string,
}

export const bytesToHex = (bytes: Uint8Array) => {
    return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "")
}

export const encodeBase64 = (file: File): Promise<string> => {
    return new Promise(function (resolve) {
        let imgReader = new FileReader();
        imgReader.onloadend = function () {
            resolve(imgReader!.result!.toString());
        }
        imgReader.readAsDataURL(file);
    });
}

const hexString = (buffer: ArrayBuffer) => {
    const byteArray = new Uint8Array(buffer)
    const hexCodes = [...byteArray].map(value => {
        return value.toString(16).padStart(2, '0')
    })

    return '0x' + hexCodes.join('')
}

const fileToArrayBuffer = async (file: File): Promise<string | ArrayBuffer | null> => {
    return new Promise(function (resolve) {
        const reader = new FileReader()
        const readFile = function () {
            const buffer = reader.result
            resolve(buffer)
        }

        reader.addEventListener('load', readFile)
        reader.readAsArrayBuffer(file)
    })
}

async function bufferToSha256(buffer: ArrayBuffer) {
    return window.crypto.subtle.digest('SHA-256', buffer)
}

const arrayBufferToBuffer = (ab: ArrayBuffer) => {
    // ab byte length to buffer
    var buffer = new Buffer(ab.byteLength)
    var view = new Uint8Array(ab)
    for (var i = 0; i < buffer.length; ++i) {
        buffer[i] = view[i]
    }
    return buffer
}

export const fileToSha256Hex = async (file: File) => {
    const buffer = await fileToArrayBuffer(file)
    const hash = await bufferToSha256(arrayBufferToBuffer(buffer as ArrayBuffer))
    return hexString(hash)
}

export const base64ToHex = (str: string) => {
    const raw = atob(str)
    let result = '';
    for (let i = 0; i < raw.length; i++) {
        const hex = raw.charCodeAt(i).toString(16);
        result += (hex.length === 2 ? hex : '0' + hex);
    }
    return result.toLowerCase();
}

const _privkey = bytesToHex(Noble.utils.randomPrivateKey())
let pushing = false

export const isPushing = async () => {
    while (pushing) {
        await sleep(10)
    }
}

export const textToHex = (text: string) => {
    var encoder = new TextEncoder().encode(text)
    return [...new Uint8Array(encoder)]
        .map(x => x.toString(16).padStart(2, "0"))
        .join("")
}

export const buf2hex = (buffer: ArrayBuffer) => {
    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join('')
}

export const getFastestFeeRate = async (network: string = 'mainnet') => {
    try {
        const res = await fetch(`https://mempool.space/${network === 'testnet' ? 'testnet/' : ''}api/v1/fees/recommended`)
        const json = await res.json()
        if (json.halfHourFee < 6) return 6
        return json.halfHourFee
    } catch (e) {
        throw new Error("Mempool connection failed for address")
    }
}

export const hexToBytes = (hex: string) => {
    const bytes = hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16))
    return bytes ? Uint8Array.from(bytes) : new Uint8Array()
}

export const satsToBitcoin = (sats: number) => {
    if (sats >= 100000000) sats = sats * 10
    let string = String(sats).padStart(8, "0").slice(0, -9) + "." + String(sats).padStart(8, "0").slice(-9)
    if (string.substring(0, 1) == ".") string = "0" + string
    return string
}

export const sleep = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export const addressOnceHadMoney = async (address: string, includeMempool?: boolean, network = 'mainnet') => {
    try {
        const res = await fetch(`https://mempool.space/${network === 'testnet' ? 'testnet/' : ''}api/address/${address}`)
        const json = await res.json()
        if (json.chain_stats.tx_count > 0 || (includeMempool && json.mempool_stats.tx_count > 0)) {
            return true
        }
        return false
    } catch(e) {
        console.error(e)
        return false
    }
}

export const loopTilAddressReceivesMoney = async (address: string, includeMempool?: boolean, network = 'mainnet') => {
    let itReceivedMoney = false

    async function isDataSetYet(data_i_seek: boolean) {
        return new Promise(function (resolve) {
            if (!data_i_seek) {
                setTimeout(async function () {
                    try {
                        itReceivedMoney = await addressOnceHadMoney(address, includeMempool, network)
                    }catch(e){ }
                    let msg = await isDataSetYet(itReceivedMoney)
                    resolve(msg)
                }, 2000)
            } else {
                resolve(data_i_seek)
            }
        })
    }

    async function getTimeoutData() {
        let data_i_seek = await isDataSetYet(itReceivedMoney)
        return data_i_seek
    }

    let returnable = await getTimeoutData()
    return returnable
}

export const addressReceivedMoneyInThisTx = async (address: string, network = 'mainnet'): Promise<[string, number, number]> => {
    let txid = ""
    let vout = 0
    let amt = 0

    try {
        const res = await fetch(`https://mempool.space/${network === 'testnet' ? 'testnet/' : ''}api/address/${address}/txs`)
        const json = await res.json()
        json.forEach((tx: any) => {
            tx.vout.forEach((output: { value: number, scriptpubkey_address: string }, index: number) => {
                if (output.scriptpubkey_address == address) {
                    txid = tx.txid
                    vout = index
                    amt = output.value
                }
            })
        })
    } catch(e) {
        console.error(e)
    }

    return [txid, vout, amt]
}

export const pushBTCpmt = async (rawtx: string, network = 'mainnet') => {
    let txid: string | undefined

    try {
        const res = await fetch(`https://mempool.space/${network === 'testnet' ? 'testnet/' : ''}api/tx`, {
            method: "POST",
            body: rawtx,
        })

        txid = await res.text()

        if (res.status !== 200) {
            throw new Error(txid)
        }
    } catch(e) {
        throw new Error((e as Error).message)
    }

    return txid
}

export type Inscription = {
    leaf: any;
    tapkey: any;
    cblock: any;
    inscriptionAddress: any;
    txsize?: number;
    fee: any;
    script?: string[];
    script_orig: any;
}

let include_mempool = true

export const inscribe = async (log: (msg: string) => void, seckey: KeyPair, toAddress: string, inscription: Inscription, vout = 0, network = 'mainnet') => {

    // we are running into an issue with 25 child transactions for unconfirmed parents.
    // so once the limit is reached, we wait for the parent tx to confirm.

    await loopTilAddressReceivesMoney(inscription.inscriptionAddress, include_mempool, network)
    await sleep(2000)
    
    let txinfo2 = await addressReceivedMoneyInThisTx(inscription.inscriptionAddress, network)

    let txid2 = txinfo2[0]
    let amt2 = txinfo2[2]

    const redeemtx = Tx.create({
        vin  : [{
            txid: txid2,
            vout: vout,
            prevout: {
                value: amt2,
                scriptPubKey: [ 'OP_1', inscription.tapkey ]
            },
        }],
        vout : [{
            value: amt2 - inscription.fee,
            scriptPubKey: [ 'OP_1', toAddress ]
        }],
    })

    const sig = await Signer.taproot.sign(seckey.raw, redeemtx, 0, {extension: inscription.leaf})
    redeemtx.vin[0].witness = [ sig.hex, inscription.script_orig, inscription.cblock ]

    console.dir(redeemtx, {depth: null})

    let rawtx2 = Tx.encode(redeemtx).hex
    let _txid2: string | undefined

    // since we don't know any mempool space api rate limits, we will be careful with spamming
    await isPushing()
    pushing = true
    while (!_txid2) {
        _txid2 = await pushBTCpmt( rawtx2, network )
        await sleep(2000)
    }
    pushing = false

    if(_txid2.includes('descendant'))
    {
        include_mempool = false
        inscribe(log, seckey, toAddress, inscription, vout, network)
        log('Descendant transaction detected. Waiting for parent to confirm.')
        return
    }

    try {
        JSON.parse(_txid2)
    } catch (e) {
        log(`${_txid2}i0`)
    }
}

export type ParsedFile = {
    text?: string;
    name: string;
    hex: string;
    mimetype: string | undefined;
    sha256: string;
}

export const run = async (params: RunParams) => {
    let address: string
    let files: ParsedFile[] = []

    try {
        address = Address.p2tr.decode(params.address).hex
    } catch (error) {
        throw new Error("Invalid taproot address")
    }

    const network = params.network || 'mainnet'

    try {
        const res = await fetch(`https://mempool.space/${network === 'testnet' ? 'testnet/' : ''}api/address/${params.address}`)
        await res.json()
    } catch (e) {
        throw new Error("Mempool connection failed for address")
    }

    if (params.text && params.mimetype) {
        files.push({
            text: params.text,
            name: textToHex(params.text),
            hex: textToHex(params.text),
            mimetype: params.mimetype,
            sha256: ''
        })
    } else if (params.files) {
        if (params.privkey) {
            files = params.files as unknown as ParsedFile[];
        } else {
            for (let file of params.files) {
                if (file.size >= 350000) {
                    alert("One of your desired inscriptions exceeds the maximum of 350kb.")
                    break;
                }
                let mimetype = file.type;
                if (mimetype.includes("text/plain")) {
                    mimetype += ";charset=utf-8";
                }
                const b64 = await encodeBase64(file);
                let base64 = b64.substring(b64.indexOf("base64,") + 7);
                let hex = base64ToHex(base64);
    
                let sha256 = await fileToSha256Hex(file);
    
                files.push({
                    name: file.name,
                    hex: hex,
                    mimetype: mimetype,
                    sha256: sha256.replace('0x', '')
                });
            }
        }
    }

    let padding = params.padding || 546

    let privkey = params.privkey || _privkey

    localStorage.setItem('pending', JSON.stringify({
        files,
        address: params.address,
        mimetype: params.mimetype,
        text: params.text,
        padding,
        tip: params.tip,
        tippingAddress: params.tippingAddress,
        privkey,
        network,
    }))

    let seckey = new KeyPair(privkey)
    let pubkey = seckey.pub.rawX

    const ec = new TextEncoder()

    const init_script = [
        pubkey,
        'OP_CHECKSIG'
    ]

    let init_leaf = await Tap.tree.getLeaf(Script.encode(init_script))
    let [init_tapkey, init_cblock] = await Tap.getPubKey(pubkey, {target: init_leaf})

    const test_redeemtx = Tx.create({
        vin  : [{
            txid: 'a99d1112bcb35845fd44e703ef2c611f0360dd2bb28927625dbc13eab58cd968',
            vout: 0,
            prevout: {
                value: 10000,
                scriptPubKey: [ 'OP_1', init_tapkey ]
            },
        }],
        vout : [{
            value: 8000,
            scriptPubKey: [ 'OP_1', init_tapkey ]
        }],
    })

    const test_sig = await Signer.taproot.sign(seckey.raw, test_redeemtx, 0, {extension: init_leaf})
    test_redeemtx.vin[0].witness = [ test_sig.hex, init_script, init_cblock ]
    const isValid = await Signer.taproot.verify(test_redeemtx, 0, { pubkey })

    if(!isValid)
    {
        alert('Generated keys could not be validated. Please reload the app.')
        return
    }

    let total_fee = 0
    let inscriptions = []

    let feerate = await getFastestFeeRate(network)

    let base_size = 160

    for (let file of files) {
        const hex = file.hex
        const data = hexToBytes(hex)
        const mimetype = ec.encode(file.mimetype)

        const script = [
            pubkey,
            'OP_CHECKSIG',
            'OP_0',
            'OP_IF',
            ec.encode('ord'),
            '01',
            mimetype,
            'OP_0',
            data,
            'OP_ENDIF'
        ]

        const script_backup = [
            '0x' + buf2hex(pubkey.buffer),
            'OP_CHECKSIG',
            'OP_0',
            'OP_IF',
            '0x' + buf2hex(ec.encode('ord')),
            '01',
            '0x' + buf2hex(mimetype),
            'OP_0',
            '0x' + buf2hex(data),
            'OP_ENDIF'
        ]

        const leaf = await Tap.tree.getLeaf(Script.encode(script))
        const [tapkey, cblock] = await Tap.getPubKey(pubkey, { target: leaf })

        let inscriptionAddress = Address.p2tr.encode(tapkey, "testnet")

        let prefix = 160

        let txsize = prefix + Math.floor(data.length / 4)

        let fee = feerate * txsize
        total_fee += fee

        inscriptions.push({
            leaf: leaf,
            tapkey: tapkey,
            cblock: cblock,
            inscriptionAddress: inscriptionAddress,
            txsize: txsize,
            fee: fee,
            script: script_backup,
            script_orig: script
        })
    }

    let total_fees = total_fee + ( ( 69 + ( ( inscriptions.length + 1 ) * 2 ) * 31 + 10 ) * feerate ) + (base_size * inscriptions.length) + (padding * inscriptions.length);

    let fundingAddress = Address.p2tr.encode(init_tapkey, "testnet")

    const tip = params.tip || 1000

    if(!isNaN(tip) && tip >= 500)
    {
        total_fees += (50 * feerate) + tip
    }

    // round up to nearest 1000 sats
    console.log(total_fees, Math.ceil(total_fees / 1000) * 1000)

    params.log(`Please send ${satsToBitcoin(Math.ceil(total_fees / 1000) * 1000)} btc to ${fundingAddress} to fund the inscription`)

    await loopTilAddressReceivesMoney(fundingAddress, true, network)
    await sleep(2000)

    let txinfo = await addressReceivedMoneyInThisTx(fundingAddress, network)

    let txid = txinfo[0]
    let vout = txinfo[1]
    let amt = txinfo[2]

    params.log(`Do not close browser, '${txid}' is confirmed, waiting for inscription to be confirmed...`)

    let outputs = []

    for (let inscription of inscriptions) {
        outputs.push(
            {
                value: padding + inscription.fee,
                scriptPubKey: [ 'OP_1', inscription.tapkey ]
            }
        )
    }

    if(!isNaN(tip) && tip >= 500) {
        outputs.push(
            {
                value: tip,
                scriptPubKey: [ 'OP_1', Address.p2tr.decode(params.tippingAddress).hex ]
            }
        )
    }

    const init_redeemtx = Tx.create({
        vin: [{
            txid: txid,
            vout: vout,
            prevout: {
                value: amt,
                scriptPubKey: [ 'OP_1', init_tapkey ]
            },
        }],
        vout : outputs
    })

    const init_sig = await Signer.taproot.sign(seckey.raw, init_redeemtx, 0, {extension: init_leaf})
    init_redeemtx.vin[0].witness = [ init_sig.hex, init_script, init_cblock ]

    let rawtx = Tx.encode(init_redeemtx).hex
    console.log('rawtx', hexToBytes(rawtx))
    let pushing = true

    while (pushing) {
        try {
            await pushBTCpmt(rawtx, network)
            pushing = false
        } catch (e) {
            console.error(e)
            await sleep(2000)
        }
    }

    for (let inscription of inscriptions) {
        await inscribe(params.log, seckey, address, inscription, 0, network)
    }

    localStorage.removeItem('pending')
}

export const pending = (log: (message: string) => void) => {
    const pending = localStorage.getItem('pending')

    if (pending) {
        const parsed = JSON.parse(pending)
        if (parsed) {
            run({ log, ...parsed })
        }
    }
}
