# 创建数据库
create database if not exists theTower;

use theTower;

# 创建表
drop table if exists user;
create table user
(
    ID       int auto_increment primary key,
    USER_NAME varchar(50)  not null unique,
    PASSWORD varchar(100) not null
);

insert user (USER_NAME, PASSWORD) values ('lignting', '123456');
insert user (USER_NAME, PASSWORD) values ('user1', 'password1');
insert user (USER_NAME, PASSWORD) values ('user2', 'password2');