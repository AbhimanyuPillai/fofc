// app/3d-demo/component/3d-model-loader.tsx
'use client';

export function Model3DLoader() {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            background: 'rgba(0, 0, 0, 0.8)',
            borderRadius: '12px',
            color: 'white',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            minWidth: '200px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
        }}>
            <div style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(255, 255, 255, 0.3)',
                borderTop: '3px solid white',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                marginBottom: '12px'
            }}></div>
            <h2 style={{
                margin: '0 0 8px 0',
                fontSize: '16px',
                fontWeight: '600'
            }}>
                Loading 3D Model
            </h2>
            <p style={{
                margin: '0',
                fontSize: '13px',
                color: 'rgba(255, 255, 255, 0.7)'
            }}>
                Please wait...
            </p>
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}