// /dl/* 路由：已下线方案的安装包一律返回 410（不再提供下载）
// 说明：2026-11-13 下线「视频 / 下载机」相关技术开源
const BLOCKED = new Set([
  'openhwlab-m301h-nas-download.zip',
  'openhwlab-nas-download.zip',
  'openhwlab-video-desktop.zip',
]);

const PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>该资源已下线 · OpenHW Lab</title>
<style>body{margin:0;background:#0b1220;color:#c9d8ee;font:16px/1.8 -apple-system,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
.box{max-width:620px;background:#131c2e;border:1px dashed #8b9bb4;border-radius:14px;padding:28px 26px}
h1{font-size:18px;color:#fff;margin:0 0 10px}code{background:#0b1220;border:1px solid #2f4570;border-radius:6px;padding:1px 6px;font-size:13px}
a{color:#5aa9ef}</style></head><body><div class="box">
<h1>⛔ 该资源已下线，不再提供下载</h1>
<p>本网站<b>不提供与看电视、看视频、下载机相关的技术开源</b>。目前市面上很多人依靠把机顶盒升级成视频盒子、下载机盒子作为生计，技术不应破坏这个生态；我们希望大家都能够守住生计、安居乐业，因此下线了与视频、下载机相关的技术。<b>请大家理解！</b></p>
<p>This resource has been retired and is no longer available. We do not open-source TV-watching, video-streaming or download-box technology.</p>
<p><a href="/projects">← 返回机顶盒项目 / Back to projects</a></p>
</div></body></html>`;

export async function onRequest(context) {
  const { request, env, params } = context;
  const name = String((params && params.file) || '').toLowerCase();
  if (BLOCKED.has(name)) {
    return new Response(PAGE, {
      status: 410,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
    });
  }
  return env.ASSETS.fetch(request);
}
