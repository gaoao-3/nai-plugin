import plugin from '../../../lib/plugins/plugin.js'
import { handle } from '../utils/parse.js'
import { url2Base64 } from '../utils/utils.js'
import queue from '../components/Queue.js'
import Config from '../components/Config.js'

export class Text extends plugin {
  constructor() {
    super({
      name: 'nai-绘画',
      dsc: '绘画',
      event: 'message',
      priority: 1009,
      rule: [{
        reg: '^[/#]draw([\\s\\S]*)',
        fnc: 'text'
      }]
    })
  }

  async text(e) {
    if (!queue.list.length) return e.reply('无可用Token\n- 请先添加Token后使用该功能\n- 使用「/nai --reload」指令刷新已经配置的Token')

    let msg = e.msg.match(this.rule[0].reg)[1]
    await redis.set(`nai:again:${e.user_id}`, JSON.stringify({
      msg: e.msg,
      img: e.img ?? null,
      type: 'text'
    }))

    const preset = JSON.parse(await redis.get(`nai:preset:${e.user_id}`)) || {};
    msg = Object.entries(preset)
      .sort(([a], [b]) => b.length - a.length)
      .reduce((s, [k, v]) => s.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), v), msg);

    try {
      const param = await handle(msg)
      if (e.img) param.parameters.reference_image = await url2Base64(e.img[0])

      const task = new Promise(async (resolve, reject) => {
        let restNumber = await queue.enqueue({
          _callback: { resolve, reject },
          param,
          user: e.user_id,
          type: 'text'
        })
        e.reply(
          `${param.parameters.reference_image ? '[已上传参考图片] ' : ''}` +
          `当前队列还有${restNumber}人，预计等待时间：${14 * (restNumber + 1)}秒`
        )
      })

      const result = await task
      const { forward_msg } = Config.getConfig();
      const message = `图片生成完成，ID：${result.fileName}`;
      const image = segment.image("base64://" + result.base64);

      forward_msg
        ? await e.reply(Bot.makeForwardMsg([
          { message: message },
          { message: { ...image, origin: true } }
        ]))
        : await e.reply([message, image, segment.button([{ text: '再来一张', callback: e.msg }])]);

    } catch (error) {
      logger.mark(logger.blue('[NAI PLUGIN]'), logger.cyan(`绘制图片失败`), logger.red(error));
      e.reply(error.message || '未知错误，请检查控制台日志')
      return true
    }
  }
}