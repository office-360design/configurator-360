"""Run from project root with: python -m server"""
import os
import uvicorn

if __name__ == '__main__':
    uvicorn.run('server.app:app', host=os.getenv('PAVING_HOST', '127.0.0.1'),
                port=int(os.getenv('PAVING_PORT', '8000')), workers=1)
