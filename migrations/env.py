from alembic import context
from festops.models import Base, URL, engine

target_metadata = Base.metadata
def run_offline():
    context.configure(url=URL, target_metadata=target_metadata, literal_binds=True, compare_type=True)
    with context.begin_transaction(): context.run_migrations()
def run_online():
    with engine.connect() as conn:
        context.configure(connection=conn, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction(): context.run_migrations()
run_offline() if context.is_offline_mode() else run_online()
