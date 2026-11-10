type ArticleProtocol = 'oauth' | 'oidc';
export type Actor = 'browser' | 'client' | 'provider' | 'resource';
export const actors: {
    id: Actor;
    name: string;
    host: string;
    role: string;
}[] = [
    { id: 'browser', name: 'ブラウザ', host: '利用者の端末', role: '画面とリダイレクトを扱う' },
    { id: 'client', name: 'クライアント', host: 'app.example', role: '写真を表示するWebアプリ' },
    { id: 'provider', name: '認可サーバー / OP', host: 'id.example', role: '本人確認・許可・トークン発行' },
    { id: 'resource', name: 'リソースサーバー', host: 'api.example', role: '写真APIを保護する' },
];
export const articles = {
    oauth: { title: '一番分かりやすい OAuth の説明', url: 'https://qiita.com/TakahikoKawasaki/items/e37caf50776e00e733be' },
    oidc: { title: '一番分かりやすい OpenID Connect の説明', url: 'https://qiita.com/TakahikoKawasaki/items/498ca08bbfcc341691fe' },
};
export interface LogEntry {
    from: Actor;
    to: Actor;
    kind: 'request' | 'response' | 'internal';
    label: string;
    wire: string;
    recordedAt?: string;
    diagramDetail?: string;
}
export interface ReplayStep {
    id: string;
    phase: string;
    title: string;
    summary: string;
    route: string;
    article: {
        protocol: ArticleProtocol;
        range: string;
        connection: string;
    };
    logs: LogEntry[];
    inspect: {
        field: string;
        meaning: string;
    }[];
    result: string;
    highlight?: string;
}
const request = (from: Actor, to: Actor, label: string, wire: string): LogEntry => ({ from, to, kind: 'request', label, wire });
const response = (from: Actor, to: Actor, label: string, wire: string): LogEntry => ({ from, to, kind: 'response', label, wire });
const internal = (from: Actor, label: string, wire: string): LogEntry => ({ from, to: from, kind: 'internal', label, wire });
const oauthArticle = (range: string, connection: string) => ({ protocol: 'oauth' as const, range, connection });
const oidcArticle = (range: string, connection: string) => ({ protocol: 'oidc' as const, range, connection });
// A self-contained fictional server-side web app, not a reconstruction of the Keycloak recording.
// All values are teaching identifiers. Cryptographic operations are described, not executed.
export function makeReplay(): ReplayStep[] {
    const scope = 'openid photos.read';
    const authQuery = `response_type=code&client_id=photo-web&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback&scope=${encodeURIComponent(scope)}&state=st_demo_01&code_challenge=cc_demo_S256&code_challenge_method=S256${'&nonce=nonce_demo_01'}`;
    return [
        {
            id: 'blocked', phase: 'APIを守る', title: 'トークンなしでは、写真を返さない',
            summary: 'まずクライアントから写真APIを呼んでみます。リソースサーバーはアクセストークンがないため拒否します。',
            route: 'サーバー間通信', article: oauthArticle('（5）–（16）', 'APIに届いた要求を、アクセストークンの有無で区別する。'),
            logs: [request('client', 'resource', 'トークンを付けずにAPIを要求', 'GET /photos HTTP/1.1\nHost: api.example\nAccept: application/json'),
                internal('resource', 'アクセストークンを探す', '[resource] Authorization header: absent\n[resource] reject: bearer token required'),
                response('resource', 'client', '写真データを返さず拒否', 'HTTP/1.1 401 Unauthorized\nWWW-Authenticate: Bearer realm="photos"\nContent-Type: application/json\n\n{"error":"unauthorized"}')],
            inspect: [{ field: '401 / WWW-Authenticate', meaning: 'このAPIはBearerトークンを必要とする。データはまだ返っていない。' }],
            result: 'APIを利用するには、先にアクセストークンを取得する必要がある。',
        },
        {
            id: 'authorize', phase: '発行を依頼する', title: 'ブラウザを認可サーバーへ案内する',
            summary: '利用者が「写真を見る」を開きます。クライアントは要求と照合用の値を保存し、302応答でブラウザの移動先を指定します。',
            route: 'ブラウザ経由', article: oidcArticle('（25）–（32）', 'OAuthの要求にopenidを加え、IDトークンも要求する。'),
            logs: [request('browser', 'client', '写真の表示ページを開く', 'GET /photos HTTP/1.1\nHost: app.example'),
                internal('client', '認可要求と照合用の値を準備', `[client] save state = st_demo_01\n[client] save code_verifier = cv_demo_01\n[client] code_challenge = BASE64URL(SHA256(code_verifier))\n[client] challenge teaching label = cc_demo_S256${'\n[client] save nonce = nonce_demo_01'}`),
                response('client', 'browser', 'Locationへ移動するよう指示', `HTTP/1.1 302 Found\nLocation: https://id.example/authorize?${authQuery}\nSet-Cookie: auth_tx=tx_demo_01; Secure; HttpOnly; SameSite=Lax`)],
            inspect: [{ field: 'response_type=code', meaning: 'ブラウザにはまず認可コードを返してもらう。ここではトークンを要求URLに入れない。' },
                { field: `scope=${scope}`, meaning: 'openidがOIDCの要求であることを示す。photos.readはこの教材API独自の読み取り権限。' },
                { field: 'state / code_challenge', meaning: 'stateは戻ってきた応答との照合用。challengeは後で送るverifierと対応する。値は計算結果を省略した教材識別子。' }],
            result: 'クライアントが認可サーバーへ直接画面を要求するのではなく、ブラウザに移動を指示した。',
            highlight: 'scopeのopenidで認証結果を要求し、nonceで今回の要求との対応を確認します。',
        },
        {
            id: 'provider', phase: '発行を依頼する', title: 'ブラウザが認可要求を届ける',
            summary: 'ブラウザがLocationのURLを開きます。認可サーバーはclient_idやredirect_uriなどを確認し、本人確認と許可の画面を返します。',
            route: 'ブラウザ経由', article: oidcArticle('（20）–（21）', 'OPが本人確認と発行の許可を求める。'),
            logs: [request('browser', 'provider', '302の移動先にGET', `GET /authorize?${authQuery} HTTP/1.1\nHost: id.example`),
                internal('provider', '登録済みクライアントと要求を確認', '[provider] client_id = photo-web: registered\n[provider] redirect_uri = https://app.example/callback: exact match\n[provider] requested scopes: allowed\n[provider] user session: absent'),
                response('provider', 'browser', '認可サーバー自身の画面を表示', `HTTP/1.1 200 OK\nContent-Type: text/html\n\n<form action="/interaction" method="post">\n  本人確認 / Photo Webに写真の読み取りを許可\n${'  認証結果の共有も許可\n'}</form>`)],
            inspect: [{ field: 'Host: id.example', meaning: '本人確認の画面を提供するのは認可サーバー。クライアントのapp.exampleとは別のサイト。' }],
            result: 'ユーザーは認可サーバーの画面で本人確認と許可を行う。',
        },
        {
            id: 'consent', phase: '本人確認と許可', title: '本人確認と許可のあと、コードを発行する',
            summary: '利用者が認可サーバーで本人確認し、権限を許可した想定です。認可サーバーは短命・一回限りの認可コードを発行します。',
            route: 'ブラウザ経由 ＋ サーバー内部', article: oidcArticle('（21）–（24）、（32）–（35）', '本人確認と許可を経て、認証結果を発行する処理に進む。'),
            logs: [request('browser', 'provider', '本人確認情報と許可を送信（画面方式は実装依存）', 'POST /interaction HTTP/1.1\nHost: id.example\nContent-Type: application/x-www-form-urlencoded\n\naccount=demo-user&credential=[省略]&approve=yes&csrf=[省略]'),
                internal('provider', '認証・許可を記録してコードに結び付ける', `[provider] user authenticated: user_123\n[provider] consent granted: ${scope}\n[provider] issue code = code_demo_01 (short-lived, one use)\n[provider] bind code to client_id, redirect_uri, scopes,\n           user_123, code_challenge${', nonce'}`),
                response('provider', 'browser', 'コードを含むクライアントURLへ戻す', 'HTTP/1.1 302 Found\nLocation: https://app.example/callback?code=code_demo_01&state=st_demo_01')],
            inspect: [{ field: 'code=code_demo_01', meaning: 'これはトークンを取得するための認可コード。写真APIには使えない。' },
                { field: '本人確認 / 許可', meaning: '本人確認の方法や許可画面の形はOAuthで固定されない。この例は両方を認可サーバーで行う。' }],
            result: 'ブラウザが受け取ったのはコードとstate。アクセストークンはまだ受け取っていない。',
        },
        {
            id: 'callback', phase: 'コードを受け渡す', title: 'ブラウザ経由で、コードがクライアントに戻る',
            summary: 'ブラウザは再びLocationを開きます。クライアントはstateを保存値と照合してから、コードの交換に進みます。',
            route: 'ブラウザ経由 → クライアント内部', article: oidcArticle('（26）–（29）', '記事でまとめて描かれる応答を、コードの受領とトークン交換に分けて見る。'),
            logs: [request('browser', 'client', 'コードとstateをcallbackへ届ける', 'GET /callback?code=code_demo_01&state=st_demo_01 HTTP/1.1\nHost: app.example\nCookie: auth_tx=tx_demo_01'),
                internal('client', '要求と応答が対応することを確認', '[client] lookup transaction: tx_demo_01\n[client] received state = st_demo_01\n[client] saved state    = st_demo_01\n[client] state match: PASS\n[client] continue with code = code_demo_01')],
            inspect: [{ field: 'state=st_demo_01', meaning: '02で保存した値と同じ。異なる場合はコード交換に進まず、要求を拒否する。' },
                { field: 'callbackへの応答', meaning: 'このHTTP要求への応答は、トークン交換と確認を終えた08で返す。それまで処理はサーバー側で続く。' }],
            result: '認可コードを受領した。まだクライアントのログインは成立していない。',
        },
        {
            id: 'token', phase: 'トークンを受け取る', title: 'サーバー同士でコードをトークンに交換する',
            summary: 'クライアントがトークンエンドポイントに直接POSTします。認可サーバーはコード・クライアント認証・PKCEを検査してトークンを返します。',
            route: 'サーバー間通信', article: oidcArticle('（29）–（35）', '同じ応答でアクセストークンとIDトークンを受け取る。'),
            logs: [request('client', 'provider', '受け取ったコードと、保存していたverifierを送る', 'POST /token HTTP/1.1\nHost: id.example\nAuthorization: Basic [photo-web:教材用secretのBase64を省略]\nContent-Type: application/x-www-form-urlencoded\n\ngrant_type=authorization_code&code=code_demo_01&redirect_uri=https%3A%2F%2Fapp.example%2Fcallback&code_verifier=cv_demo_01'),
                internal('provider', 'コードの利用条件を確認', '[provider] client authentication: PASS\n[provider] code_demo_01: exists / unexpired / unused\n[provider] client_id and redirect_uri binding: PASS\n[provider] S256(code_verifier) matches stored challenge: PASS\n[provider] consume code_demo_01'),
                response('provider', 'client', '2種類のトークンを返す', `HTTP/1.1 200 OK\nContent-Type: application/json\nCache-Control: no-store\n\n{\n  "access_token": "at_demo_01",\n  "token_type": "Bearer",\n  "expires_in": 300,\n  "scope": "${scope}"${',\n  "id_token": "[署名付きJWT: idt_demo_01]"'}\n}`)],
            inspect: [{ field: 'code / code_verifier', meaning: 'codeは05で受領した値、verifierは02で保存した値。クライアントの認証情報もブラウザを通さず送る。' },
                { field: 'access_token=at_demo_01', meaning: 'リソースサーバーで使う権限を表す。形式はOAuthでJWTに限定されない。この教材では不透明な文字列を使う。' },
                ...([{ field: 'id_token=idt_demo_01', meaning: 'OPによる認証結果をクライアントに伝える署名付きJWT。次の処理で検証する。' }])],
            result: 'トークン応答はクライアントのサーバーが受信する。ブラウザには渡していない。',
            highlight: 'アクセストークンはAPI用、IDトークンはクライアントが認証結果を確認するために使います。',
        },
        {
            id: 'validate', phase: '認証結果を確かめる', title: '公開鍵で署名を検証し、認証結果を確かめる',
            summary: 'JWTをデコードするだけでは確認になりません。信頼するOPの公開鍵で署名を検証し、発行者・宛先・有効期限・nonceも検査します。',
            route: 'サーバー間通信 ＋ クライアント内部',
            article: oidcArticle('（5）–（15）、（36）', '「署名付き名刺」を、公開鍵とIDトークンの検証として確かめる。'),
            logs: [request('client', 'provider', '信頼済み設定のjwks_uriから公開鍵を取得（キャッシュがない場合）', 'GET /jwks HTTP/1.1\nHost: id.example\nAccept: application/json'),
                response('provider', 'client', '署名検証用の公開鍵を返す', 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"keys":[{"kty":"RSA","kid":"key_demo_01",\n  "use":"sig","alg":"RS256","n":"[公開鍵の値を省略]","e":"AQAB"}]}'),
                internal('client', 'IDトークンの内容と検証結果（疑似処理）', '[client] id_token = idt_demo_01\nheader: {"alg":"RS256","kid":"key_demo_01"}\npayload: {\n  "iss":"https://id.example", "sub":"user_123",\n  "aud":"photo-web", "iat":1794268800,\n  "exp":1794269100, "nonce":"nonce_demo_01"\n}\n[client] trusted key + allowed algorithm + signature: PASS\n[client] iss = configured issuer: PASS\n[client] aud includes own client_id: PASS\n[client] now=1794268810 < exp: PASS\n[client] nonce = saved nonce_demo_01: PASS\n[client] authenticated user key = (iss, sub)')],
            inspect: [{ field: '署名 / iss / aud / exp / nonce', meaning: '署名だけでなく、信頼する発行者・自分宛て・期限内・今回の要求への応答かを確認する。失敗したらログインさせない。' },
                { field: 'sub=user_123', meaning: '発行者の中でのユーザー識別子。issと組み合わせてクライアントのユーザーに対応付ける。' },
                { field: '公開鍵', meaning: '署名を検証するための鍵。JWKSの取得先は信頼済みOPの設定から得る。鍵をキャッシュしていれば毎回のHTTP取得は不要。' }],
            result: 'クライアントが認証結果を確認できた。IDトークンを写真APIへ送る必要はない。',
            highlight: '記事の「発行者の署名付き名刺」に相当するIDトークンを、受け取ったクライアントが検証します。',
        },
        {
            id: 'session', phase: 'ブラウザへ戻る', title: 'サーバーに保存し、ブラウザにはCookieを返す',
            summary: '検証したユーザーとアクセストークンをサーバーのセッションに保存します。05で受けたcallback要求に、Cookie付きの302応答を返します。',
            route: 'クライアント内部 → ブラウザ', article: oidcArticle('（36）', '確認した認証結果をWebアプリのログインに利用する実装例。Cookie方式そのものはOIDCの規定ではない。'),
            logs: [internal('client', 'サーバー側セッションを作成', `[client] session sid_demo_01 = {\n  access_token: at_demo_01${',\n  user: (https://id.example, user_123)'}\n}\n[client] browser receives only an opaque session key`),
                response('client', 'browser', '05のcallback要求への応答', 'HTTP/1.1 302 Found\nLocation: https://app.example/photos\nSet-Cookie: app_session=sid_demo_01; Secure; HttpOnly; SameSite=Lax\nSet-Cookie: auth_tx=; Max-Age=0; Secure; HttpOnly; SameSite=Lax')],
            inspect: [{ field: 'Set-Cookie: app_session=sid_demo_01', meaning: 'ブラウザに保持させるのはセッション識別子。この構成ではアクセストークンとIDトークンをブラウザに保存しない。' }],
            result: 'クライアントのログインが成立した。続けて、APIを呼び写真を取得する。',
        },
        {
            id: 'browser-session', phase: '写真を取りに行く', title: 'ブラウザはCookieでアプリにアクセスする',
            summary: 'ブラウザは案内された写真ページを開きます。Cookieに対応するサーバー側セッションから、クライアントがアクセストークンを取り出します。',
            route: 'ブラウザ経由 ＋ クライアント内部', article: oauthArticle('（26）–（27）', 'アクセストークンを使うのはクライアント。ブラウザからのページ要求とAPI要求を分けて見る。'),
            logs: [request('browser', 'client', 'アプリ宛てのCookieを付けて再アクセス', 'GET /photos HTTP/1.1\nHost: app.example\nCookie: app_session=sid_demo_01'),
                internal('client', 'セッションに対応する権限を取り出す', `[client] lookup session: sid_demo_01\n[client] session exists and is valid: PASS${'\n[client] logged-in user = (https://id.example, user_123)'}\n[client] load access_token = at_demo_01`)],
            inspect: [{ field: 'CookieとBearer', meaning: 'ブラウザ→クライアントではCookie。次のクライアント→APIではBearerトークン。同じものを送っているわけではない。' }],
            result: 'クライアントがブラウザからの依頼を受け、サーバー側でAPIを呼ぶ。',
        },
        {
            id: 'api', phase: '写真を取りに行く', title: 'APIに提示するのはアクセストークン',
            summary: '01と同じ写真APIを、今度はアクセストークン付きで要求します。IDトークンやブラウザのCookieは写真APIへ送りません。',
            route: 'サーバー間通信', article: oauthArticle('（12）–（16）、（27）–（30）', 'クライアントがアクセストークンを添えてデータを要求する。'),
            logs: [request('client', 'resource', 'Authorizationヘッダーにアクセストークンを指定', 'GET /photos HTTP/1.1\nHost: api.example\nAccept: application/json\nAuthorization: Bearer at_demo_01')],
            inspect: [{ field: 'Authorization: Bearer at_demo_01', meaning: '06で発行され、クライアントが保持していたアクセストークン。01の要求から増えたのはこの資格情報。' }],
            result: 'リソースサーバーに届いた。データを返す前に、トークンと必要な権限を検査する。',
        },
        {
            id: 'resource', phase: '権限を確かめる', title: 'リソースサーバーが検査し、写真を返す',
            summary: 'この例では不透明なアクセストークンを使い、認可サーバーのintrospectionに有効性を問い合わせます。その結果で、権限とデータの対象を確認します。',
            route: 'サーバー間通信 ＋ リソースサーバー内部', article: oauthArticle('（14）–（16）、（28）–（30）', 'アクセストークンを取り出し、権限を調べたあとにデータを返す。検査方式は実装の選択。'),
            logs: [request('resource', 'provider', 'API自身の認証付きでトークンを照会', 'POST /introspect HTTP/1.1\nHost: id.example\nAuthorization: Basic [photos-apiの認証情報を省略]\nContent-Type: application/x-www-form-urlencoded\n\ntoken=at_demo_01'),
                response('provider', 'resource', '有効性と権限を返す', `HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"active":true,"scope":"${scope}",\n "sub":"user_123","aud":"photos-api","exp":1794269100}`),
                internal('resource', 'トークン・用途・権限・対象データを確認', '[resource] token = at_demo_01\n[resource] active=true / now=1794268810 < exp: PASS\n[resource] audience includes photos-api: PASS\n[resource] scope includes photos.read: PASS\n[resource] select photos owned by user_123\n[resource] allow access'),
                response('resource', 'client', '10のAPI要求に写真データを返す', 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"photos":[{"id":"photo_01","title":"海辺の写真"}]}')],
            inspect: [{ field: 'active / scope / sub', meaning: '有効であるだけでなく、このAPIに必要な権限とデータの対象を確認する。権限が足りなければ403にする。' },
                { field: '/introspect', meaning: 'この教材で採用した検査方法。OAuthの全構成に必須ではない。JWTアクセストークンをAPI自身で検証する構成もある。' }],
            result: '01では401だった同じAPIが、権限を確認できたため200と写真データを返した。',
        },
        {
            id: 'complete', phase: '画面に返す', title: 'APIの結果を、ブラウザの画面に返す',
            summary: 'クライアントはAPIから受け取った写真データをHTMLにします。09のページ要求に応答し、ブラウザが画面を表示します。',
            route: 'クライアント → ブラウザ', article: oidcArticle('（29）–（36）', 'OIDCで認証結果を確かめ、OAuthのアクセストークンでデータを取得する役割の違いを振り返る。'),
            logs: [response('client', 'browser', '09の写真ページ要求への応答', `HTTP/1.1 200 OK\nContent-Type: text/html\nCache-Control: no-store\n\n<main>\n  ${'<p>ログイン済み: user_123</p>\n  '}<h1>あなたの写真</h1>\n  <p>海辺の写真</p>\n</main>`),
                internal('browser', '受け取ったHTMLを描画', '[browser] render: 海辺の写真\n[browser] access_token: not received\n[browser] id_token: not received\n[browser] holds app_session=sid_demo_01')],
            inspect: [{ field: '200 OKが2つ', meaning: '11はAPI→クライアントのJSON応答、12はクライアント→ブラウザのHTML応答。通信相手も内容も異なる。' }],
            result: '認証結果の確認はクライアント、写真へのアクセス権限の確認はリソースサーバーが担当した。',
        },
    ];
}
export const questions = [
    { question: '認可コードはどこを通り、どこでトークンに変わった？', answer: 'コードは認可サーバー→ブラウザ→クライアントと戻る。クライアントがサーバー間のPOST /tokenで交換する。', step: 'token', link: '06 コード交換を確認' },
    { question: 'アクセストークンとIDトークンは、誰が何のために使った？', answer: 'アクセストークンはクライアントがAPIに提示し、リソースサーバーが権限を検査する。OIDCのIDトークンはクライアントが署名や内容を検証し、ユーザーの認証結果を確認する。', step: 'validate', link: '07 トークンの扱いを確認' },
    { question: 'ブラウザのCookieと、APIのBearerトークンは同じもの？', answer: '異なる。ブラウザはapp_session=sid_demo_01をクライアントに送り、クライアントが保存済みのat_demo_01をAPIに送る。このサーバー側Webアプリの構成では、ブラウザにトークンを渡さない。', step: 'api', link: '10 APIへの要求を確認' },
];
export function parseReplayHash(hash: string): { index: number } {
    // Old OAuth bookmarks resolve to the same point in the sole OIDC flow.
    const id = hash.match(/^#\/(?:oauth|oidc)(?:\/([\w-]+))?$/)?.[1];
    const index = makeReplay().findIndex(step => step.id === id);
    return { index: Math.max(0, index) };
}
