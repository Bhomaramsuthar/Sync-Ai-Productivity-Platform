import { sileo, type SileoOptions } from 'sileo';

type ToastInput = string | (SileoOptions & { title: string });

function normalize(input: ToastInput, description?: string, options?: Partial<SileoOptions>): SileoOptions {
  if (typeof input === 'string') {
    return {
      title: input,
      description,
      ...options,
    };
  }
  return {
    ...input,
    description: description || input.description,
    ...options,
  };
}

export const toast = {
  success: (input: ToastInput, description?: string, options?: Partial<SileoOptions>) =>
    sileo.success(normalize(input, description, options)),

  error: (input: ToastInput, description?: string, options?: Partial<SileoOptions>) =>
    sileo.error(normalize(input, description, options)),

  warning: (input: ToastInput, description?: string, options?: Partial<SileoOptions>) =>
    sileo.warning(normalize(input, description, options)),

  info: (input: ToastInput, description?: string, options?: Partial<SileoOptions>) =>
    sileo.info(normalize(input, description, options)),

  action: (
    title: string,
    actionButton: { title: string; onClick: () => void },
    description?: string,
    options?: Partial<SileoOptions>
  ) =>
    sileo.action({
      title,
      description,
      button: actionButton,
      ...options,
    }),

  promise: <T>(
    promise: Promise<T> | (() => Promise<T>),
    msgs: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((err: unknown) => string);
    }
  ) =>
    sileo.promise(promise, {
      loading: { title: msgs.loading },
      success: (data) => ({
        title: typeof msgs.success === 'function' ? msgs.success(data) : msgs.success,
      }),
      error: (err) => ({
        title: typeof msgs.error === 'function' ? msgs.error(err) : msgs.error,
      }),
    }),

  dismiss: (id: string) => sileo.dismiss(id),
  clear: () => sileo.clear(),
  raw: sileo,
};

export { sileo };
export default toast;
