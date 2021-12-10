const axios = require('axios');
const crypto = require('crypto');

exports.decrypt = text => {
    const decipher = crypto.createDecipheriv('aes-256-ctr', process.env.cryptoKey, process.env.cryptoIv);

    let dec = decipher.update(text, 'hex', 'utf8');
    dec += decipher.final('utf8');

    return dec;
}

exports.request = async (url, body) => {
    const result = await axios.post(url, body);

    if (result.data.code != 200) return result.data.code;
    else return result.data;
}

exports.homeworkParser = (task) => {
    let state;
    let handback = "";

    switch (task.effectue) {
        case true:
            state = "marqué comme fait";
            break;

        case false:
            state = "<b style='text-decoration: underline;'>marqué comme à faire</b>";
            break;
    }

    switch (task.rendreEnLigne) {
        case true:
            handback = " | À rendre via EcoleDirecte";
            break;

        default:
            handback = "";
            break;
    }

    return [state, handback];
}