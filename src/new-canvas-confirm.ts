import { App, Modal, Setting } from 'obsidian';

export class NewCanvasConfirm extends Modal {
  constructor(app:App,private t:(zh:string,en:string)=>string,private folder:string,private confirm:()=>Promise<void>,private finished:()=>void){super(app);}
  onOpen(){
    this.setTitle(this.t('新建画板','New canvas'));
    this.contentEl.createEl('p',{text:this.t('是否创建新的空白画板？','Create a new blank canvas?')});
    new Setting(this.contentEl)
      .setDesc(this.t(`新画板保存位置：${this.folder}`,`New canvas folder: ${this.folder}`))
      .addButton(button=>button.setButtonText(this.t('取消','Cancel')).onClick(()=>this.close()))
      .addButton(button=>button.setButtonText(this.t('新建画板','Create canvas')).setCta().onClick(()=>{
        this.close();void this.confirm();
      }));
  }
  onClose(){this.contentEl.empty();this.finished();}
}
