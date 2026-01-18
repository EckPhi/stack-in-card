import {
  LitElement,
  customElement,
  property,
  TemplateResult,
  html,
  css,
  CSSResult,
  PropertyValues,
  query,
} from 'lit-element';
import { ifDefined } from 'lit-html/directives/if-defined';
import {
  HomeAssistant,
  LovelaceCardConfig,
  createThing,
  LovelaceCard,
  LovelaceCardEditor,
  LovelaceConfig,
  fireEvent,
  HASSDomEvent,
} from 'custom-card-helpers';
import { HaFormSchema, StackInCardConfig } from './types';
import * as pjson from '../package.json';
import { mdiCodeBraces, mdiDelete, mdiListBoxOutline, mdiPlus } from '@mdi/js';
import { nothing } from 'lit-html';

console.info(
  `%c STACK-IN-CARD \n%c   Version ${pjson.version}   `,
  'color: orange; font-weight: bold; background: black',
  'color: white; font-weight: bold; background: dimgray',
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HELPERS = (window as any).loadCardHelpers ? (window as any).loadCardHelpers() : undefined;

async function loadCardEditorPicker(): Promise<void> {
  // Ensure hui-card-element-editor and hui-card-picker are loaded.
  // They happen to be used by the vertical-stack card editor but there must be a better way?
  let cls = customElements.get('hui-vertical-stack-card');
  if (!cls) {
    (await HELPERS).createCardElement({ type: 'vertical-stack', cards: [] });
    await customElements.whenDefined('hui-vertical-stack-card');
    cls = customElements.get('hui-vertical-stack-card');
  }
  if (cls) cls = cls.prototype.constructor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (cls && (cls as any).getConfigElement) await (cls as any).getConfigElement();
}

@customElement('stack-in-card')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class StackInCard extends LitElement implements LovelaceCard {
  @property() protected _card?: LovelaceCard;

  @property() private _config?: StackInCardConfig;

  private _hass?: HomeAssistant;

  private _cardPromise: Promise<LovelaceCard> | undefined;

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (this._card) {
      this._card.hass = hass;
    }
  }

  static get styles(): CSSResult {
    return css`
      ha-card {
        overflow: visible;
      }
    `;
  }

  static getConfigElement() {
    return document.createElement('hui-stack-card-editor');
  }

  public setConfig(config: StackInCardConfig): void {
    if (!config.cards) {
      throw new Error(`There is no cards parameter defined`);
    }
    this._config = {
      mode: 'vertical',
      ...config,
      keep: {
        background: false,
        margin: false,
        box_shadow: false,
        border_radius: false,
        border: false,
        ...config.keep,
      },
    };
    if (this._config.keep?.margin && this._config.keep?.outer_padding === undefined)
      this._config.keep.outer_padding = true;
    this._createStack();
  }

  protected updated(changedProperties: PropertyValues): void {
    super.updated(changedProperties);
    if (!this._card) return;
    this._waitForChildren(this._card, false);
    window.setTimeout(() => {
      if (!this._config?.keep?.background) this._waitForChildren(this._card, true);
      if (this._config?.keep?.outer_padding && this._card?.shadowRoot) {
        const stackRoot = this._card.shadowRoot.getElementById('root');
        if (stackRoot) stackRoot.style.padding = '8px';
      }
    }, 500);
  }

  private async _createStack() {
    this._cardPromise = this._createCard({
      type: `${this._config!.mode}-stack`,
      cards: this._config!.cards,
    });

    this._card = await this._cardPromise;
  }

  protected render(): TemplateResult {
    if (!this._hass || !this._config) {
      return html``;
    }

    return html`
      <ha-card header=${ifDefined(this._config.title)}>
        <div>${this._card}</div>
      </ha-card>
    `;
  }

  private _updateStyle(e: LovelaceCard | null, withBg: boolean): void {
    if (!e) return;
    if (!this._config?.keep?.box_shadow) e.style.boxShadow = 'none';
    if (!this._config?.keep?.border && getComputedStyle(e).getPropertyValue('--keep-border').trim() !== 'true') {
      e.style.border = 'none';
    }
    if (
      !this._config?.keep?.background &&
      withBg &&
      getComputedStyle(e).getPropertyValue('--keep-background').trim() !== 'true'
    ) {
      e.style.background = 'transparent';
    }
    if (!this._config?.keep?.border_radius) e.style.borderRadius = '0';
  }

  private _loopChildren(e: LovelaceCard, withBg: boolean): void {
    const searchElements = e.childNodes;
    searchElements.forEach((childE) => {
      if ((childE as Element).tagName === 'STACK-IN-CARD') return;
      if (!this._config?.keep?.margin && (childE as LovelaceCard).style) {
        (childE as LovelaceCard).style.margin = '0px';
      }
      this._waitForChildren(childE as LovelaceCard, withBg);
    });
  }

  private _updateChildren(element: LovelaceCard | undefined, withBg: boolean): void {
    if (!element) return;
    if (element.shadowRoot) {
      const card = element.shadowRoot.querySelector('ha-card') as LovelaceCard;
      if (!card) {
        // if (element.shadowRoot.querySelector('stack-in-card')) return;
        const searchEles = element.shadowRoot.getElementById('root') || element.shadowRoot.getElementById('card');
        if (!searchEles) return;
        searchEles.setAttribute('style', 'gap:var(--vertical-stack-card-gap,var(--stack-card-gap,0px)) !important');
        this._loopChildren(searchEles as LovelaceCard, withBg);
      } else {
        this._updateStyle(card, withBg);
      }
    } else {
      if (typeof element.querySelector === 'function' && element.querySelector('ha-card')) {
        this._updateStyle(element.querySelector('ha-card'), withBg);
      }
      this._loopChildren(element as LovelaceCard, withBg);
    }
  }

  private _waitForChildren(element: LovelaceCard | undefined, withBg: boolean): void {
    if (((element as unknown) as LitElement).updateComplete) {
      ((element as unknown) as LitElement).updateComplete.then(() => {
        this._updateChildren(element, withBg);
      });
    } else {
      this._updateChildren(element, withBg);
    }
  }

  private async _createCard(config: LovelaceCardConfig): Promise<LovelaceCard> {
    let element: LovelaceCard;
    if (HELPERS) {
      element = (await HELPERS).createCardElement(config);
    } else {
      element = createThing(config);
    }
    if (this._hass) {
      element.hass = this._hass;
    }
    if (element) {
      element.addEventListener(
        'll-rebuild',
        (ev) => {
          ev.stopPropagation();
          this._rebuildCard(element, config);
        },
        { once: true },
      );
    }
    return element;
  }

  private async _rebuildCard(element: LovelaceCard, config: LovelaceCardConfig): Promise<LovelaceCard> {
    const newCard = await this._createCard(config);
    element.replaceWith(newCard);
    this._card = newCard;
    window.setTimeout(() => {
      if (!this._config?.keep?.background) this._waitForChildren(this._card, true);
      if (this._config?.keep?.outer_padding && this._card?.shadowRoot) {
        const stackRoot = this._card.shadowRoot.getElementById('root');
        if (stackRoot) stackRoot.style.padding = '8px';
      }
    }, 500);
    return newCard;
  }

  public async getCardSize(): Promise<number> {
    await this._cardPromise;
    if (!this._card) {
      return 0;
    }
    return await this._computeCardSize(this._card);
  }

  private _computeCardSize(card: LovelaceCard): number | Promise<number> {
    if (typeof card.getCardSize === 'function') {
      return card.getCardSize();
    }
    if (customElements.get(card.localName)) {
      return 1;
    }
    return customElements.whenDefined(card.localName).then(() => this._computeCardSize(card));
  }
}

@customElement('stack-in-card-editor')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class StackInCardEditor extends LitElement implements LovelaceCardEditor {
  @property() private _config?: StackInCardConfig;

  @property() public hass?: HomeAssistant;
  @property({ attribute: false }) public lovelace?: LovelaceConfig;

  @property() protected _selectedCard = 0;

  @property() protected _GUImode = true;

  @property() protected _guiModeAvailable? = true;

  @query('hui-card-element-editor')
  protected _cardEditorEl?: any;
  private _loadedElements = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _schema: HaFormSchema[] | undefined;

  public setConfig(config: StackInCardConfig): void {
    this._config = config;
  }

  async connectedCallback(): Promise<void> {
    super.connectedCallback();

    if (!this._loadedElements) {
      await loadCardEditorPicker();
      this._loadedElements = true;
    }
  }

  protected render() {
    if (!this.hass || !this._config) {
      return nothing;
    }

    if (!this._schema) {
      this._schema = [
        {
          type: 'string',
          name: 'title',
          label: 'Title',
          description: { suffix: 'Header of the card' },
        },
        {
          type: 'select',
          name: 'mode',
          label: 'Mode',
          default: 'vertical',
          options: [
            ['vertical', 'Vertical'],
            ['horizontal', 'Horizontal'],
          ],
        },
        {
          type: 'expandable',
          name: '',
          title: 'Keep',
          schema: [
            {
              type: 'boolean',
              name: 'keep.margin',
              label: 'Margin',
              description: { suffix: 'Keep margin of the card' },
            },
            {
              type: 'boolean',
              name: 'keep.background',
              label: 'Background',
              description: { suffix: 'Keep background of the card' },
            },
            {
              type: 'boolean',
              name: 'keep.box_shadow',
              label: 'Box Shadow',
              description: { suffix: 'Keep box shadow of the card' },
            },
            {
              type: 'boolean',
              name: 'keep.border',
              label: 'Border',
              description: { suffix: 'Keep border of the card' },
            },
            {
              type: 'boolean',
              name: 'keep.border_radius',
              label: 'Border Radius',
              description: { suffix: 'Keep border radius of the card' },
            },
            {
              type: 'boolean',
              name: 'keep.outer_padding',
              label: 'Outer Padding',
              description: { suffix: 'Add padding to the outer card' },
            },
          ],
        },
      ];
    }

    const selected = this._selectedCard!;
    const numcards = this._config.cards.length;

    const isGuiMode = !this._cardEditorEl || this._GUImode;

    return html`
      <div class="card-config">
        <ha-form
          .hass=${this.hass}
          .data=${this._config}
          .schema=${this._schema}
          .computeLabel=${(s): string => s.label ?? s.name}
          .computeHelper=${(s): string => s.helper ?? ''}
          @value-changed=${this._valueChanged}
        ></ha-form>
        <div class="toolbar">
          <paper-tabs .selected=${selected} scrollable @iron-activate=${this._handleSelectedCard}>
            ${this._config.cards.map((_card, i) => html` <paper-tab> ${i + 1} </paper-tab> `)}
          </paper-tabs>
          <paper-tabs
            id="add-card"
            .selected=${selected === numcards ? '0' : undefined}
            @iron-activate=${this._handleSelectedCard}
          >
            <paper-tab>
              <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
            </paper-tab>
          </paper-tabs>
        </div>

        <div id="editor">
          ${selected < numcards
            ? html`
                <div id="card-options">
                  <ha-icon-button
                    class="gui-mode-button"
                    @click=${this._toggleMode}
                    .disabled=${!this._guiModeAvailable}
                    .label=${this.hass!.localize(
                      isGuiMode
                        ? 'ui.panel.lovelace.editor.edit_card.show_code_editor'
                        : 'ui.panel.lovelace.editor.edit_card.show_visual_editor',
                    )}
                    .path=${isGuiMode ? mdiCodeBraces : mdiListBoxOutline}
                  ></ha-icon-button>

                  <ha-icon-button-arrow-prev
                    .disabled=${selected === 0}
                    .label=${this.hass!.localize('ui.panel.lovelace.editor.edit_card.move_before')}
                    @click=${this._handleMove}
                    .move=${-1}
                  ></ha-icon-button-arrow-prev>

                  <ha-icon-button-arrow-next
                    .label=${this.hass!.localize('ui.panel.lovelace.editor.edit_card.move_after')}
                    .disabled=${selected === numcards - 1}
                    @click=${this._handleMove}
                    .move=${1}
                  ></ha-icon-button-arrow-next>

                  <ha-icon-button
                    .label=${this.hass!.localize('ui.panel.lovelace.editor.edit_card.delete')}
                    .path=${mdiDelete}
                    @click=${this._handleDeleteCard}
                  ></ha-icon-button>
                </div>

                <hui-card-element-editor
                  .hass=${this.hass}
                  .value=${this._config.cards[selected]}
                  .lovelace=${this.lovelace}
                  @config-changed=${this._handleConfigChanged}
                  @GUImode-changed=${this._handleGUIModeChanged}
                ></hui-card-element-editor>
              `
            : html`
                <h1>Add card</h1>
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

  private _valueChanged(ev: CustomEvent): void {
    const config = ev.detail.value;
    const updatedConfig = Object.entries(config).reduce(
      (acc, [key, value]) => {
        if (key.startsWith('keep.')) {
          const newKey = key.replace('keep.', '');
          acc.keep = { ...acc.keep, [newKey]: value };
        } else {
          acc[key] = value;
        }
        return acc;
      },
      { ...this._config } as StackInCardConfig,
    );
    fireEvent(this, 'config-changed', { config: updatedConfig });
  }

  protected _handleSelectedCard(ev) {
    if (ev.target.id === 'add-card') {
      this._selectedCard = this._config!.cards.length;
      return;
    }
    this._setMode(true);
    this._guiModeAvailable = true;
    this._selectedCard = parseInt(ev.detail.selected, 10);
  }

  protected _handleConfigChanged(ev: HASSDomEvent<any>) {
    ev.stopPropagation();
    if (!this._config) {
      return;
    }
    const cards = [...this._config.cards];
    cards[this._selectedCard] = ev.detail.config as LovelaceCardConfig;
    this._config = { ...this._config, cards };
    this._guiModeAvailable = ev.detail.guiModeAvailable;
    fireEvent(this, 'config-changed', { config: this._config });
  }

  protected _handleCardPicked(ev) {
    ev.stopPropagation();
    if (!this._config) {
      return;
    }
    const config = ev.detail.config;
    const cards = [...this._config.cards, config];
    this._config = { ...this._config, cards };
    fireEvent(this, 'config-changed', { config: this._config });
  }

  protected _handleDeleteCard() {
    if (!this._config) {
      return;
    }
    const cards = [...this._config.cards];
    cards.splice(this._selectedCard, 1);
    this._config = { ...this._config, cards };
    this._selectedCard = Math.max(0, this._selectedCard - 1);
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

  protected _setMode(value: boolean): void {
    this._GUImode = value;
    if (this._cardEditorEl) {
      this._cardEditorEl!.GUImode = value;
    }
  }

  static get styles(): CSSResult {
    return css`
      .card-config {
        /* Cancels overlapping Margins for HAForm + Card Config options */
        overflow: auto;
      }
      ha-switch {
        padding: 16px 6px;
      }
      .side-by-side {
        display: flex;
        align-items: flex-end;
      }
      .side-by-side > * {
        flex: 1;
        padding-right: 8px;
        padding-inline-end: 8px;
        padding-inline-start: initial;
      }
      .side-by-side > *:last-child {
        flex: 1;
        padding-right: 0;
        padding-inline-end: 0;
        padding-inline-start: initial;
      }
      .suffix {
        margin: 0 8px;
      }
      hui-action-editor,
      ha-select,
      ha-textfield,
      ha-icon-picker {
        margin-top: 8px;
        display: block;
      }
      .toolbar {
        display: flex;
        --paper-tabs-selection-bar-color: var(--primary-color);
        --paper-tab-ink: var(--primary-color);
      }
      paper-tabs {
        display: flex;
        font-size: 14px;
        flex-grow: 1;
      }
      #add-card {
        max-width: 32px;
        padding: 0;
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
    `;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).customCards = (window as any).customCards || [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).customCards.push({
  type: 'stack-in-card',
  name: 'Stack In Card',
  preview: false,
  description: 'Group multiple cards into one card without the borders.',
});
