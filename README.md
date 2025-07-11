# node 16.20.2 mongodb 7
# cai dat mongo
# cai dat mongosh


🔄 Khởi động lại MongoDB service:
net stop MongoDB
net start MongoDB

# tat xac thuc
#security:
  #authorization: enabled
# tao tai khoan admin 

use admin
db.createUser({
  user: "name_data",
  pwd: "pass_data",
  roles: [
    { role: "userAdminAnyDatabase", db: "admin" },
    { role: "readWriteAnyDatabase", db: "admin" }
  ]
})

# bat xac thuc
	sudo nano /etc/mongod.conf
# win
	C:\Program Files\MongoDB\Server\<version>\bin\mongod.cfg
# Tìm và bỏ comment hoặc thêm đoạn sau nếu chưa có:
	security:
	  authorization: enabled
# Bước 3: Cho phép truy cập từ bên ngoài (remote access)
	sudo nano /etc/mongod.conf
  	bindIp: 127.0.0.1
  Và sửa thành:
  	bindIp: 0.0.0.0

# run as admin
	net stop MongoDB
	net start MongoDB
# check
	mongosh "mongodb://name_data:pass_data@127.0.0.1:27017/admin"

# ket noi voi mongo bang tai khoan admin 
mongosh "mongodb://name_data:pass_data@127.0.0.1:27017/admin"

use saigonvrg
db.createUser({
  user: "my_user",
  pwd: "my_password",
  roles: [ { role: "readWrite", db: "saigonvrg" } ]
})

# .env dung tai khoan nay

SYNC_LOG_MONGODB=mongodb://my_user:my_password@127.0.0.1:27017/saigonvrg


# tao .env
	NODE_ENV=production
	SYNC_LOG_MONGODB=mongodb://name_data:pass_data@127.0.0.1:27017/data
	SYNC_LOG_DIR=C:\test\txt\
	SYNC_LOG_DIR_MOVE=C:\test\move\
	SYNC_LOG_DIR_ERROR=C:\test\error\
# start run as admin
	npm init -y
	npm install
	node sync.js
