import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(plainPassword: string): string {
    return bcrypt.hashSync(plainPassword, SALT_ROUNDS);
}

export function verifyPassword(
    plainPassword: string,
    passwordHash: string
): boolean {
    return bcrypt.compareSync(plainPassword, passwordHash);
}
