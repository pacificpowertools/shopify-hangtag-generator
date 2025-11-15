const { Session } = require('@shopify/shopify-api');

// In-memory session storage for development
// For production, use a database (PostgreSQL, MySQL, Redis, etc.)
class MemorySessionStorage {
  constructor() {
    this.sessions = new Map();
  }

  async storeSession(session) {
    this.sessions.set(session.id, session);
    return true;
  }

  async loadSession(id) {
    const sessionData = this.sessions.get(id);
    if (!sessionData) return undefined;

    // Reconstruct session object
    return new Session(sessionData);
  }

  async deleteSession(id) {
    this.sessions.delete(id);
    return true;
  }

  async deleteSessions(ids) {
    ids.forEach(id => this.sessions.delete(id));
    return true;
  }

  async findSessionsByShop(shop) {
    const sessions = [];
    for (const [id, session] of this.sessions.entries()) {
      if (session.shop === shop) {
        sessions.push(new Session(session));
      }
    }
    return sessions;
  }
}

const sessionStorage = new MemorySessionStorage();

module.exports = sessionStorage;
