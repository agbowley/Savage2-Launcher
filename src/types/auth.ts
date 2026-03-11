export interface AuthUser {
    email: string;
    username: string;
    accountId: string;
}

export interface LoginRequest {
    email: string;
    password: string;
    clientType: string;
}

export interface RegisterRequest {
    username: string;
    email: string;
    password: string;
    referralCode?: string;
}

export interface LoginResponse {
    token: string;
    refreshToken: string;
}

export interface RefreshTokenResponse {
    token: string;
    refreshToken: string;
}

export interface CheckExistsResponse {
    usernameExists: boolean;
}

export interface BanInfo {
    message: string;
    code: string;
    banReason: string;
    bannedUntil: string;
}

export interface DecodedJwt {
    email: string;
    username: string;
    accountId: string;
    permissionLevel: string;
    exp: number;
}

export interface MsAuthResponse {
    cookie: string;
    accountId: number;
}
