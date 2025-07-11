# node 16.20.2 mongodb 7
# cai dat mongo
# cai dat mongosh
# tao tai khoan
	mongosh
	use data
	db.createUser({
	  user: "name_data",
	  pwd: "pass_data",
	  roles: [
	    { role: "readWrite", db: "data" },
	    { role: "dbAdmin", db: "data" }
	  ]
	})
# tao table check
	db.em_places.insertOne({
	  factory_id: "1",
	  name: "demo",
	  folder: "demo",
	  type_id: "1",
	  standard_id: "1",
	  lat: null,
	  lng: null,
	  timeout: "10",
	  timeout_unit: "m",
	  alert: [],
	  alert_merge: [],
	  place_id: 13,
	  updated_at: ISODate("2025-07-08T12:58:27.326Z"),
	  created_at: ISODate("2025-07-08T12:58:27.326Z")
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
	mongosh "mongodb://name_data:pass_data@127.0.0.1:27017/data"
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
