import * as React from 'react';
export type HelpAction='read'|'board'|'write';
export function StoryHelp({onClose,onAction}:{onClose():void;onAction(action:HelpAction):void}) {
  const ref=React.useRef<HTMLDialogElement>(null);
  React.useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close();},[]);
  return <dialog className="studio-help" ref={ref} aria-label="操作与验收" onCancel={event=>{event.preventDefault();onClose();}}>
    <header><div><span>工作台使用路径</span><h2>先看故事，再检查镜头</h2><p>按下面三个步骤操作，每一步都有可观察的结果</p></div><button aria-label="关闭操作与验收" onClick={onClose}>关闭</button></header>
    <ol>
      <li><span className="studio-help-number">01</span><div><h3>通读完整故事</h3><p>打开全片总览，阅读 A/B 线正文；点击一段正文</p><p className="studio-help-check"><strong>验收看这里</strong>底部切到全片轨道，播放头移动，对应故事卡高亮；总览继续保留</p><button className="story-primary" onClick={()=>onAction('read')}>打开全片总览</button></div></li>
      <li><span className="studio-help-number">02</span><div><h3>检查场次与镜头</h3><p>进入一个场次的分镜，查看画面、描述、时长和关联故事卡</p><p className="studio-help-check"><strong>验收看这里</strong>分镜图与镜头轨道一致；点影像可播放；预估与实排时长可以核对</p><button onClick={()=>onAction('board')}>查看场次分镜</button></div></li>
      <li><span className="studio-help-number">03</span><div><h3>验证保存与撤销</h3><p>试改一段正文，点击其他位置；再点击时间轴上的撤销</p><p className="studio-help-check"><strong>验收看这里</strong>编辑中提示待保存，离开输入框后显示已保存；撤销后恢复原文，重新打开仍能读到已保存内容</p><button onClick={()=>onAction('write')}>回到正文编辑</button></div></li>
    </ol>
    <footer>整理故事：在左侧新增幕／序列，把场次拖进去；每条内容旁的「⋯」可改名或移动。<br/>轨道操作：拖动卡片调整时间，拖动两端调整时长；吸附、撤销与重做仍在底部工具栏</footer>
  </dialog>;
}
