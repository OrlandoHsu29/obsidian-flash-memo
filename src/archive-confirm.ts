import { App, Modal, Setting } from 'obsidian';

export class ArchiveConfirm extends Modal {
  constructor(app:App,private t:(zh:string,en:string)=>string,private folder:string,private confirm:()=>Promise<void>,private finished:()=>void){super(app);}
  onOpen(){
    this.setTitle(this.t('归档当前画板？','Archive current canvas?'));
    this.contentEl.createEl('p',{text:this.t('当前画板将先保存，再按时间命名归档，并切换到新的空白画板。','Save the current canvas, archive it with a timestamp, and switch to a new blank canvas.')});
    this.contentEl.createEl('p',{text:this.t(`知识库内路径：${this.folder}`,`Vault-relative folder: ${this.folder}`)});
    new Setting(this.contentEl)
      .addButton(button=>button.setButtonText(this.t('取消','Cancel')).onClick(()=>this.close()))
      .addButton(button=>button.setButtonText(this.t('归档并新建','Archive and create')).setCta().onClick(()=>{
        this.close();void this.confirm();
      }));
  }
  onClose(){this.contentEl.empty();this.finished();}
}
