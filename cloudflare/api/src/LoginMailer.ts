export interface LoginEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface LoginMailer {
  /** Rejects when the message could not be handed to the provider. */
  send(email: LoginEmail): Promise<void>;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export class ResendMailer implements LoginMailer {
  public constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  public async send(email: LoginEmail): Promise<void> {
    if (!this.apiKey) throw new Error('RESEND_API_KEY is not configured');
    const response = await this.fetchFn(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    });
    if (!response.ok) throw new Error(`Resend rejected the email with status ${response.status}`);
  }
}

/** Local development only: prints the link to the `wrangler dev` console instead of sending it. */
export class ConsoleMailer implements LoginMailer {
  public async send(email: LoginEmail): Promise<void> {
    console.log(`[login email] to ${email.to}\n${email.text}`);
  }
}
