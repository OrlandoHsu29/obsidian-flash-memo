import { App, Modal, setIcon } from 'obsidian';
import type { MemoType } from './memo-file';

export class NewCanvasConfirm extends Modal {
  constructor(app:App,private t:(zh:string,en:string)=>string,private confirm:(type:MemoType)=>Promise<void>,private finished:()=>void,private owner?:Document){super(app);}
  onOpen(){
    if (this.owner && this.containerEl.ownerDocument !== this.owner) this.owner.body.append(this.containerEl);
    this.modalEl.classList.add('flash-memo-new');
    this.setTitle(this.t('新建速记','New memo'));
    const actions = this.contentEl.createDiv({cls: 'flash-memo-new-actions'});
    const choices: [MemoType, string, string][] = [
      ['note', 'file-pen-line', this.t('新建笔记', 'New note')],
      ['sketch', 'pencil-ruler', this.t('新建画板', 'New sketch')],
    ];
    let chosen = false;
    for (const [type, icon, label] of choices) {
      const button = actions.createEl('button', {cls: 'flash-memo-new-choice', type: 'button'});
      const iconEl = button.createSpan({cls: 'flash-memo-new-icon'});
      setIcon(iconEl, icon);
      iconEl.setAttribute('aria-hidden', 'true');
      button.createSpan({text: label});
      button.addEventListener('click', () => {
        if (chosen) return;
        chosen = true;
        this.close();void this.confirm(type);
      });
    }
  }
  onClose(){this.contentEl.empty();this.finished();}
}
