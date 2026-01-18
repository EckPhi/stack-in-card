import {
  mdiCodeBraces,
  mdiContentCopy,
  mdiContentCut,
  mdiDelete,
  mdiListBoxOutline,
  mdiPlus,
} from '@mdi/js';
import { fireEvent, HASSDomEvent, LovelaceCardConfig, LovelaceCardEditor, LovelaceConfig } from 'custom-card-helpers';
import deepClone from 'deep-clone-simple';
import { css, CSSResultGroup, html, LitElement, nothing } from 'lit';

import { customElement, property, query, state } from 'lit/decorators';
import { keyed } from 'lit/directives/keyed';

import { StackInCardConfig } from './types';

const SCHEMA = [
  {
    name: 'title',
    selector: { text: {} },
  },
  {
    name: 'mode',
    default: 'vertical',
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          {
            value: 'vertical',
            label: 'vertical'
          },
          {
            value: 'horizontal',
            label: 'horizontal'
          }
        ],
      },
    },

  },
  {
    name: 'keep',
    type: 'grid',
    schema: [
      {
        name: 'margin',
        selector: { boolean: {} },
      },
      {
        name: 'background',
        selector: { boolean: {} },
      },
      {
        name: 'box_shadow',
        selector: { boolean: {} },
      },
      {
        name: 'border_radius',
        selector: { boolean: {} },
      },
      {
        name: 'outer_padding',
        selector: { boolean: {} },
      },
    ],
  },
] as const;

@customElement('stack-in-card-editor')
class StackInCardEditor extends LitElement implements LovelaceCardEditor {
  protected _keys = new Map<string, string>();
  protected _clipboard?: LovelaceCardConfig;
  @property({ attribute: false }) public lovelace?: LovelaceConfig;
  @state() protected _config?: StackInCardConfig;
  protected _schema = SCHEMA;
  @state() protected _selectedCard = 0;

  @state() protected _GUImode = true;

  @query('hui-card-element-editor')
  protected _cardEditorEl?: any;

  @state() protected _guiModeAvailable? = true;
  @property() hass;
  setConfig(config) {
    this._config = config;
  }

  _config_changed(ev: CustomEvent) {
    ev.stopPropagation();
    if (!this._config) return;
    this._config = ev.detail.config;
    this.dispatchEvent(
      new CustomEvent('config-changed', { detail: { config: this._config } })
    );
  }

  protected formData(): object {
    return this._config!
  }
  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }
    const selected = this._selectedCard!;
    const numcards = this._config.cards.length;

    const isGuiMode = !this._cardEditorEl || this._GUImode;

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this.formData()}
        .schema=${this._schema}
        .computeLabel=${this._computeLabelCallback}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <div class='card-config'>
        <div class='toolbar'>
          <ha-tab-group @wa-tab-show=${this._handleSelectedCard}>
            ${this._config.cards.map(
      (_card, i) =>
        html`<ha-tab-group-tab slot='nav' .panel=${i} .active=${i === selected}>
                  ${i + 1}
                </ha-tab-group-tab>`
    )}
          </ha-tab-group>
          <ha-icon-button
            @click=${this._handleAddCard}
            .path=${mdiPlus}
          ></ha-icon-button>
        </div>

        <div id='editor'>
          ${selected < numcards
        ? html`
                <div id='card-options'>
                  <ha-icon-button
                    class='gui-mode-button'
                    @click=${this._toggleMode}
                    .disabled=${!this._guiModeAvailable}
                    .label=${this.hass!.localize(
          isGuiMode
            ? 'ui.panel.lovelace.editor.edit_card.show_code_editor'
            : 'ui.panel.lovelace.editor.edit_card.show_visual_editor'
        )}
                    .path=${isGuiMode ? mdiCodeBraces : mdiListBoxOutline}
                  ></ha-icon-button>

                  <ha-icon-button-arrow-prev
                    .disabled=${selected === 0}
                    .label=${this.hass!.localize(
          'ui.panel.lovelace.editor.edit_card.move_before'
        )}
                    @click=${this._handleMove}
                    .move=${-1}
                  ></ha-icon-button-arrow-prev>

                  <ha-icon-button-arrow-next
                    .label=${this.hass!.localize(
          'ui.panel.lovelace.editor.edit_card.move_after'
        )}
                    .disabled=${selected === numcards - 1}
                    @click=${this._handleMove}
                    .move=${1}
                  ></ha-icon-button-arrow-next>

                  <ha-icon-button
                    .label=${this.hass!.localize(
          'ui.panel.lovelace.editor.edit_card.copy'
        )}
                    .path=${mdiContentCopy}
                    @click=${this._handleCopyCard}
                  ></ha-icon-button>

                  <ha-icon-button
                    .label=${this.hass!.localize(
          'ui.panel.lovelace.editor.edit_card.cut'
        )}
                    .path=${mdiContentCut}
                    @click=${this._handleCutCard}
                  ></ha-icon-button>

                  <ha-icon-button
                    .label=${this.hass!.localize(
          'ui.panel.lovelace.editor.edit_card.delete')}
                    .path=${mdiDelete}
                    @click=${this._handleDeleteCard}
                  ></ha-icon-button>
                </div>
                ${keyed(
            this._getKey(this._config.cards, selected),
            html`<hui-card-element-editor
                    .hass=${this.hass}
                    .value=${this._config.cards[selected]}
                    .lovelace=${this.lovelace}
                    @config-changed=${this._handleConfigChanged}
                    @GUImode-changed=${this._handleGUIModeChanged}
                  ></hui-card-element-editor>`
          )}
              `
        : html`
                <hui-card-picker
                  .hass=${this.hass}
                  .lovelace=${this.lovelace}
                  @config-changed=${this._handleCardPicked}
                ></hui-card-picker>
              `}
        </div>
      </div>
    `;
  }

  private _getKey(cards: LovelaceCardConfig[], index: number): string {
    const key = `${index}-${cards.length}`;
    if (!this._keys.has(key)) {
      this._keys.set(key, Math.random().toString());
    }

    return this._keys.get(key)!;
  }

  protected async _handleAddCard() {
    this._selectedCard = this._config!.cards.length;
    await this.updateComplete;
    (this.renderRoot.querySelector('sl-tab-group')! as any).syncIndicator();
  }

  protected _handleSelectedCard(ev) {
    this._GUImode = true;
    this._guiModeAvailable = true;
    this._selectedCard = parseInt(ev.detail.name, 10);
  }

  protected _handleConfigChanged(ev: HASSDomEvent<any>) {
    ev.stopPropagation();
    if (!this._config) {
      return;
    }
    const cards = [...this._config.cards];
    const newCard = ev.detail.config as LovelaceCardConfig;
    cards[this._selectedCard] = newCard;
    this._config = { ...this._config, cards };
    this._guiModeAvailable = ev.detail.guiModeAvailable;
    fireEvent(this, "config-changed", { config: this._config });
  }

  protected _handleCardPicked(ev) {
    ev.stopPropagation();
    if (!this._config) {
      return;
    }
    const config = ev.detail.config;
    const cards = [...this._config.cards, config];
    this._config = { ...this._config, cards };
    this._keys.clear();
    fireEvent(this, 'config-changed', { config: this._config });
  }

  protected _handleCopyCard() {
    if (!this._config) {
      return;
    }
    this._clipboard = deepClone(this._config.cards[this._selectedCard]);
  }

  protected _handleCutCard() {
    this._handleCopyCard();
    this._handleDeleteCard();
  }

  protected _handleDeleteCard() {
    if (!this._config) {
      return;
    }
    const cards = [...this._config.cards];
    cards.splice(this._selectedCard, 1);
    this._config = { ...this._config, cards };
    this._selectedCard = Math.max(0, this._selectedCard - 1);
    this._keys.clear();
    fireEvent(this, 'config-changed', { config: this._config });
  }

  protected _handleMove(ev: Event) {
    if (!this._config) {
      return;
    }
    const move = (ev.currentTarget as any).move;
    const source = this._selectedCard;
    const target = source + move;
    const cards = [...this._config.cards];
    const card = cards.splice(this._selectedCard, 1)[0];
    cards.splice(target, 0, card);
    this._config = {
      ...this._config,
      cards,
    };
    this._selectedCard = target;
    this._keys.clear();
    fireEvent(this, 'config-changed', { config: this._config });
  }

  protected _handleGUIModeChanged(ev: HASSDomEvent<any>): void {
    ev.stopPropagation();
    this._GUImode = ev.detail.guiMode;
    this._guiModeAvailable = ev.detail.guiModeAvailable;
  }

  protected _toggleMode(): void {
    this._cardEditorEl?.toggleMode();
  }

  protected _valueChanged(ev: CustomEvent): void {
    fireEvent(this, 'config-changed', { config: ev.detail.value });
  }

  protected _computeLabelCallback = (schema: any) => schema.name;

  static get styles(): CSSResultGroup {
    return [

      css`
        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        sl-tab-group {
          flex-grow: 1;
          min-width: 0;
          --ha-tab-track-color: var(--card-background-color);
        }

        #card-options {
          display: flex;
          justify-content: flex-end;
          width: 100%;
        }

        #editor {
          border: 1px solid var(--divider-color);
          padding: 12px;
        }
        @media (max-width: 450px) {
          #editor {
            margin: 0 -12px;
          }
        }

        .gui-mode-button {
          margin-right: auto;
          margin-inline-end: auto;
          margin-inline-start: initial;
        }
      `,
    ];
  }
}

