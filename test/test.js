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

handle = async () =>{
    const text = '@早餐 6.94 现金 > 吃饭'
    const { output } = await costflow.parse(text, config)
    console.log(output)

    const d = new Date();
    const mon = d.getMonth()+1;
    const filename = d.getFullYear().toString()+'/0-default/'+mon.toString()+'-expenses.bean';
    console.log(filename);
    const owner = 'soki';
    const repo = 'mymoney';

    const octokit = new Octokit({ auth: 'token' });
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/contents/'+filename,
      {
        owner: owner,
        repo: repo,
      },
    );

    const { content: encodeContent, encoding, sha, path } = response.data;
    const content = Buffer.from(encodeContent, encoding).toString();

    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      path,
      sha,
      owner: owner,
      repo: repo,
      message: 'bot',
      content: Buffer.from(`${content}${output}\n\n`).toString('base64'),
    });

};

handle()

