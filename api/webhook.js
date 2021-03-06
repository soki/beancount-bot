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
    服饰: 'Expenses:Shopping:Clothing',
    日用百货: 'Expenses:Shopping:Home',
    电子数码: 'Expenses:Shopping:Digital',
    医疗健康: 'Expenses:Health',
    生活缴费: 'Expenses:Home:Utilities',
    生活服务: 'Expenses:Services',
    娱乐: 'Expenses:Entertainment',
    子女: 'Expenses:Child',
    房租: 'Expenses:Home:Rent',
    保险: 'Expenses:Insurance',
    房贷: 'Expenses:Loan',
    礼物: 'Expenses:Gift',
    红包: 'Expenses:RedEnvelope',
    话费: 'Expenses:Phone',
    云服务: 'Expenses:Cloud',
    火车票: 'Expenses:Transport:Railway',
  },
  formula: {
    "肥仔水": "@肥仔水 {{amount}} Assets:Cash > Expenses:Food:Other",
    "滴滴": "@滴滴 {{amount}} Assets:Cash > Expenses:Transport:TAXI",
    "买菜": "@买菜 {{amount}} Assets:Cash > Expenses:Food:Ingredients",
    "水果": "@水果 {{amount}} Assets:Cash > Expenses:Food:Fruit",
    "吃的": "{{pre}} Assets:Cash > Expenses:Food:Other",
    "吃饭": "{{pre}} Assets:Cash > Expenses:Food:Restaurant",
    "发红包": "@发红包 {{amount}} Assets:Cash > Expenses:RedEnvelope",
    "收红包": "@收红包 {{-amount}} Income:RedEnvelope > Assets:Cash",
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
                    [{text:"提交",callback_data:'y'+message_id}, {text:"取消",callback_data:'n'+message_id}]
                ]
            };
            await bot.sendMessage(id, output, { reply_to_message_id: message_id, reply_markup: reply_markup });
        } else if (body.callback_query) {
            const { id, data, message } = body.callback_query;
            const typ = data.slice(0, 1);
            const record_idx = data.slice(1);
            const text = records.get(record_idx);
            if (!text) {
                await bot.answerCallbackQuery(id, {text: '未知错误'});
                return;
            }
            
            let optext = '⛔ 已取消';
            if (typ == 'y') {
                optext = '✅ 已提交';

                //提交到github
                const d = new Date();
                const mon = d.getMonth()+1;
                const filename = d.getFullYear().toString()+'/0-default/'+mon.toString().padStart(2,'0')+'-expenses.bean';
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
            }

            await bot.editMessageText(message.text+'\n\n'+optext, {
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
