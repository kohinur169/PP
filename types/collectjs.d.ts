// path: types/collectjs.d.ts

export interface CollectJsCustomCss {
  [selector: string]: {
    [rule: string]: string;
  };
}

export interface CollectJsFieldConfig {
  selector: string;
  placeholder?: string | undefined;
}

export interface CollectJsCardMetadata {
  number?: string | undefined;
  bin?: string | undefined;
  exp?: string | undefined;
  type?: string | undefined;
  hash?: string | undefined;
}

export interface CollectJsTokenResponse {
  token?: string | undefined;
  card?: CollectJsCardMetadata | undefined;
  check?: {
    hash?: string | undefined;
    aba?: string | undefined;
    account?: string | undefined;
    name?: string | undefined;
  } | undefined;
}

export interface CollectJsConfiguration {
  paymentSelector?: string | undefined;
  variant?: 'inline' | 'stacked' | undefined;
  styleObject?: CollectJsCustomCss | undefined;
  fields?: {
    ccnumber?: CollectJsFieldConfig | undefined;
    ccexp?: CollectJsFieldConfig | undefined;
    cvv?: CollectJsFieldConfig | undefined;
  } | undefined;
  callback?: ((response: CollectJsTokenResponse) => void) | undefined;
  validationCallback?: ((field: string, status: boolean, message: string) => void) | undefined;
  timeoutDuration?: number | undefined;
  timeoutCallback?: (() => void) | undefined;
  fieldsAvailableCallback?: (() => void) | undefined;
  price?: string | undefined;
  currency?: string | undefined;
  country?: string | undefined;
}

export interface CollectJSGlobal {
  configure(config: CollectJsConfiguration): void;
  startPaymentRequest?(): void;
  tokenize?(): void;
  closePaymentRequest?(): void;
}

declare global {
  interface Window {
    CollectJS?: CollectJSGlobal | undefined;
  }
}
