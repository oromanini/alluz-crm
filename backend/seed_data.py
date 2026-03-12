from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path
from auth import get_password_hash
from datetime import datetime, timezone
import uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']


async def seed_database():
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("Criando usuários....")
    
    # Criar usuários
    await db.users.delete_many({'email': 'admin@alluz.com.br'})

    users = [
        {
            'id': str(uuid.uuid4()),
            'email': 'sdr@alluz.com.br',
            'password_hash': get_password_hash('sdr123'),
            'nome': 'SDR Demo',
            'role': 'sdr',
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'email': 'closer@alluz.com.br',
            'password_hash': get_password_hash('closer123'),
            'nome': 'Closer Demo',
            'role': 'closer',
            'created_at': datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for user in users:
        existing = await db.users.find_one({'email': user['email']})
        if not existing:
            await db.users.insert_one(user)
            print(f"Usuário criado: {user['email']}")
    
    # Criar templates WhatsApp
    templates = [
        {
            'id': str(uuid.uuid4()),
            'nome': 'Primeiro Contato',
            'categoria': 'primeiro_contato',
            'mensagem': 'Olá {nome}! Sou da Alluz Energia. Recebi seu interesse em energia solar. Podemos conversar agora?',
            'ativo': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'nome': 'Agendamento Meet',
            'categoria': 'agendamento',
            'mensagem': 'Olá {nome}! Sua reunião está confirmada para {data_hora}. Link: {link}',
            'ativo': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'nome': 'Confirmação Visita',
            'categoria': 'confirmacao',
            'mensagem': 'Olá {nome}! Confirmando visita técnica amanhã às {hora}. Está tudo certo?',
            'ativo': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'nome': 'Follow-up D0',
            'categoria': 'followup',
            'mensagem': 'Olá {nome}! Proposta enviada. Vamos agendar 10 minutos para tirar dúvidas?',
            'ativo': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        },
        {
            'id': str(uuid.uuid4()),
            'nome': 'Follow-up D7',
            'categoria': 'followup',
            'mensagem': 'Olá {nome}! Como não tivemos retorno, posso arquivar sua proposta?',
            'ativo': True,
            'created_at': datetime.now(timezone.utc).isoformat()
        }
    ]
    
    for template in templates:
        existing = await db.whatsapp_templates.find_one({'nome': template['nome']})
        if not existing:
            await db.whatsapp_templates.insert_one(template)
            print(f"Template criado: {template['nome']}")
    
    print("\nSeed completo!")
    print("\nCredenciais de acesso:")
    print("SDR: sdr@alluz.com.br / sdr123")
    print("Closer: closer@alluz.com.br / closer123")
    
    client.close()


if __name__ == '__main__':
    asyncio.run(seed_database())
