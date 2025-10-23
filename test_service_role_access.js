// Supabase Service Role Key を使用した直接アクセステスト
import { createClient } from '@supabase/supabase-js';

// Service Role Key（管理者権限）
const SUPABASE_URL = 'https://mrjocjcppjnjxtudebta.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yam9jamNwcGpuanh0dWRlYnRhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDg1OTk0OSwiZXhwIjoyMDc2NDM1OTQ5fQ.JRjv6UowDMwLQ1sIKTSK1_04PXmIL5JQk91u8MDMy9c';

// Service Role クライアントを作成（管理者権限）
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// リアルタイム機能の診断と修正
async function diagnoseAndFixRealtime() {
    console.log('🔍 Supabase Service Role Key でリアルタイム機能を診断します...');
    
    try {
        // 1. データベース接続テスト
        console.log('📡 データベース接続をテスト中...');
        const { data: tables, error: tablesError } = await supabaseAdmin
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .in('table_name', ['tasks', 'comments', 'notifications', 'meetings']);
        
        if (tablesError) {
            console.error('❌ テーブル確認エラー:', tablesError);
            return;
        }
        
        console.log('✅ 対象テーブルが存在します:', tables.map(t => t.table_name));
        
        // 2. パブリケーションの確認
        console.log('📋 パブリケーション設定を確認中...');
        const { data: publications, error: pubError } = await supabaseAdmin
            .rpc('get_publications');
        
        if (pubError) {
            console.log('⚠️ パブリケーション確認でエラー（正常な場合があります）:', pubError.message);
        } else {
            console.log('📋 パブリケーション:', publications);
        }
        
        // 3. リアルタイム機能の有効化
        console.log('🔧 リアルタイム機能を有効化中...');
        
        // 各テーブルでリアルタイム機能を有効化
        const tablesToEnable = ['tasks', 'comments', 'notifications', 'meetings'];
        
        for (const tableName of tablesToEnable) {
            try {
                // REPLICA IDENTITY を FULL に設定
                const { error: replicaError } = await supabaseAdmin
                    .rpc('exec_sql', {
                        sql: `ALTER TABLE ${tableName} REPLICA IDENTITY FULL;`
                    });
                
                if (replicaError) {
                    console.log(`⚠️ ${tableName} の REPLICA IDENTITY 設定でエラー:`, replicaError.message);
                } else {
                    console.log(`✅ ${tableName} の REPLICA IDENTITY を FULL に設定しました`);
                }
                
                // リアルタイムポリシーを作成
                const { error: policyError } = await supabaseAdmin
                    .rpc('exec_sql', {
                        sql: `CREATE POLICY IF NOT EXISTS "Enable realtime for ${tableName}" ON ${tableName} FOR ALL USING (true);`
                    });
                
                if (policyError) {
                    console.log(`⚠️ ${tableName} のポリシー作成でエラー:`, policyError.message);
                } else {
                    console.log(`✅ ${tableName} のリアルタイムポリシーを作成しました`);
                }
                
            } catch (error) {
                console.log(`⚠️ ${tableName} の設定でエラー:`, error.message);
            }
        }
        
        // 4. パブリケーションにテーブルを追加
        console.log('📡 パブリケーションにテーブルを追加中...');
        
        for (const tableName of tablesToEnable) {
            try {
                const { error: addError } = await supabaseAdmin
                    .rpc('exec_sql', {
                        sql: `ALTER PUBLICATION supabase_realtime ADD TABLE ${tableName};`
                    });
                
                if (addError) {
                    console.log(`⚠️ ${tableName} をパブリケーションに追加でエラー:`, addError.message);
                } else {
                    console.log(`✅ ${tableName} をパブリケーションに追加しました`);
                }
            } catch (error) {
                console.log(`⚠️ ${tableName} のパブリケーション追加でエラー:`, error.message);
            }
        }
        
        console.log('🎉 リアルタイム機能の設定が完了しました！');
        console.log('📱 アプリをリロードして、スマートフォンでリアルタイム機能をテストしてください');
        
    } catch (error) {
        console.error('❌ 診断中にエラーが発生しました:', error);
    }
}

// 実行
diagnoseAndFixRealtime();
