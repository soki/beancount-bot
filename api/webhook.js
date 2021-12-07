// https://github.com/yagop/node-telegram-bot-api/issues/319#issuecomment-324963294
// Fixes an error with Promise cancellation
process.env.NTBA_FIX_319 = 'test';

// Require our Telegram helper package
const TelegramBot = require('node-telegram-bot-api');
const costflow = require('costflow').default;
const { Octokit } = require("@octokit/core");

const config = {
  mode: 'beancount',
  currency: 'CNY',
  timezone: 'Asia/Hong_Kong',
  account: {
    现金: 'Assets:Cash',
    信用卡: 'Liabilities:CreditCard:CMB',
    外卖: 'Expenses:Food:TakeOut',
    吃饭: 'Expenses:Food:Restaurant',
    食材: 'Expenses:Food:Ingredients ',
    水果: 'Expenses:Food:Fruit',
    餐饮: 'Expenses:Food:Other',
    零食: 'Expenses:Food:Other',
    饮料: 'Expenses:Food:Other',
    购物: 'Expenses:Shopping:Other',
    日用品: 'Expenses:Shopping:Home',
    医疗健康: 'Expenses:Health',
  },
};

const records = new Map();

// Export as an asynchronous function
// We'll wait until we've responded to the user
module.exports = async (request, response) => {
    try {
        // Create our new bot handler with the token
        // that the Botfather gave us
        // Use an environment variable so we don't expose it in our code
        const bot = new TelegramBot(process.env.TELEGRAM_TOKEN);

        // Retrieve the POST request body that gets sent from Telegram
        const { body } = request;

        // Ensure that this is a message being sent
        if (body.message) {
            const { chat: { id }, text, message_id } = body.message;
            const { output } = await costflow.parse(text, config);

            records.set(message_id.toString(), output);

            const reply_markup = {
                inline_keyboard:[
                    [{text:"提交",callback_data:'1_'+message_id}, {text:"取消",callback_data:'0_'+message_id}]
                ]
            };
            await bot.sendMessage(id, output, { reply_to_message_id: message_id, reply_markup: reply_markup });
        } else if (body.callback_query) {
            const { id, data, message } = body.callback_query;
            const typ = data.slice(0, 2);
            const record_idx = data.slice(2);

            const text = records.get(record_idx);
            if (!text) {
                await bot.answerCallbackQuery({callback_query_id: id, text: '未知错误'});
                return;
            }
            
            //提交到github
            const d = new Date();
            const mon = d.getMonth()+1;
            const filename = d.getFullYear().toString()+'/0-default/'+mon.toString()+'-expenses.bean';
            const owner = 'soki';
            const repo = 'mymoney';
            const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
            const resp = await octokit.request(
              'GET /repos/{owner}/{repo}/contents/'+filename,
              {
                owner: owner,
                repo: repo,
              },
            );

            const { content: encodeContent, encoding, sha, path } = resp.data;
            const content = Buffer.from(encodeContent, encoding).toString();

            await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
              path,
              sha,
              owner: owner,
              repo: repo,
              message: 'bot',
              content: Buffer.from(`${content}${text}\n\n`).toString('base64'),
            });

            //修改状态
            let res = '⛔ 已取消';
            if (typ == '1_') {
                res = '✅ 已提交';
            }

            await bot.editMessageText(message.text+'\n\n'+res , {
                chat_id: message.chat.id,
                message_id: message.message_id
            });

            records.delete(record_idx);
        }
    }
    catch(error) {
        // If there was an error sending our message then we 
        // can log it into the Vercel console
        console.error('Error sending message');
        console.log(error.toString());
    }
    
    // Acknowledge the message with Telegram
    // by sending a 200 HTTP status code
    // The message here doesn't matter.
    response.send('OK');
};
