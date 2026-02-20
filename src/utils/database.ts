import { PoolConnection } from 'mysql2/promise';
import db from '../../db';

// Database transaction helper class
export class DatabaseTransaction {
  private connection: PoolConnection | null = null;

  // Start a new transaction
  async begin(): Promise<PoolConnection> {
    this.connection = await db.getConnection();
    await this.connection.beginTransaction();
    return this.connection;
  }

  // Commit the transaction
  async commit(): Promise<void> {
    if (this.connection) {
      await this.connection.commit();
      this.connection.release();
      this.connection = null;
    }
  }

  // Rollback the transaction
  async rollback(): Promise<void> {
    if (this.connection) {
      await this.connection.rollback();
      this.connection.release();
      this.connection = null;
    }
  }

  // Get the current connection
  getConnection(): PoolConnection {
    if (!this.connection) {
      throw new Error('Transaction not started. Call begin() first.');
    }
    return this.connection;
  }

  // Execute multiple queries in a transaction
  static async executeTransaction<T>(
    operations: (connection: PoolConnection) => Promise<T>
  ): Promise<T> {
    const transaction = new DatabaseTransaction();
    
    try {
      const connection = await transaction.begin();
      const result = await operations(connection);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

// Database helper functions
export class DatabaseHelpers {
  
  // Execute a query with error handling
  static async executeQuery(connection: PoolConnection, query: string, params: any[] = []): Promise<any> {
    try {
      const [result] = await connection.execute(query, params);
      return result;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  // Execute a query and return the inserted ID
  static async executeInsert(connection: PoolConnection, query: string, params: any[]): Promise<number> {
    try {
      const [result] = await connection.execute(query, params) as any;
      return result.insertId;
    } catch (error) {
      console.error('Database insert error:', error);
      throw error;
    }
  }

  // Execute a query and return first row
  static async executeSelectOne(connection: PoolConnection, query: string, params: any[] = []): Promise<any> {
    try {
      const [rows] = await connection.execute(query, params) as any;
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      console.error('Database select error:', error);
      throw error;
    }
  }

  // Execute a query and return all rows
  static async executeSelect(connection: PoolConnection, query: string, params: any[] = []): Promise<any[]> {
    try {
      const [rows] = await connection.execute(query, params) as any;
      return rows;
    } catch (error) {
      console.error('Database select error:', error);
      throw error;
    }
  }
}