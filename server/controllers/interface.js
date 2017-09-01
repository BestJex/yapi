import interfaceModel from '../models/interface.js';
import interfaceCatModel from '../models/interfaceCat.js';
import interfaceCaseModel from '../models/interfaceCase.js'
import followModel from '../models/follow.js'
import _ from 'underscore';
import url from 'url';
import baseController from './base.js';
import yapi from '../yapi.js';
import userModel from '../models/user.js';
import projectModel from '../models/project.js';

class interfaceController extends baseController {
    constructor(ctx) {
        super(ctx);
        this.Model = yapi.getInst(interfaceModel);
        this.catModel = yapi.getInst(interfaceCatModel);
        this.projectModel = yapi.getInst(projectModel);
        this.caseModel = yapi.getInst(interfaceCaseModel);
        this.followModel = yapi.getInst(followModel);
        this.userModel = yapi.getInst(userModel);
    }

    /**
     * 添加项目分组
     * @interface /interface/add
     * @method POST
     * @category interface
     * @foldnumber 10
     * @param {Number}   project_id 项目id，不能为空
     * @param {String}   title 接口标题，不能为空
     * @param {String}   path 接口请求路径，不能为空
     * @param {String}   method 请求方式
     * @param {Array}  [req_headers] 请求的header信息
     * @param {String}  [req_headers[].name] 请求的header信息名
     * @param {String}  [req_headers[].value] 请求的header信息值
     * @param {Boolean}  [req_headers[].required] 是否是必须，默认为否
     * @param {String}  [req_headers[].desc] header描述
     * @param {String}  [req_body_type] 请求参数方式，有["form", "json", "text", "xml"]四种
     * @param {Array} [req_params] name, desc两个参数
     * @param {Mixed}  [req_body_form] 请求参数,如果请求方式是form，参数是Array数组，其他格式请求参数是字符串
     * @param {String} [req_body_form[].name] 请求参数名
     * @param {String} [req_body_form[].value] 请求参数值，可填写生成规则（mock）。如@email，随机生成一条email
     * @param {String} [req_body_form[].type] 请求参数类型，有["text", "file"]两种
     * @param {String} [req_body_other]  非form类型的请求参数可保存到此字段
     * @param {String}  [res_body_type] 相应信息的数据格式，有["json", "text", "xml"]三种
     * @param {String} [res_body] 响应信息，可填写任意字符串，如果res_body_type是json,则会调用mock功能
     * @param  {String} [desc] 接口描述 
     * @returns {Object} 
     * @example ./api/interface/add.json
     */
    async add(ctx) {
        let params = ctx.request.body;
        params = yapi.commons.handleParams(params, {
            project_id: 'number',
            title: 'string',
            path: 'string',
            method: 'string',
            desc: 'string',
            catid: 'number'
        });

        let auth = await this.checkAuth(params.project_id, 'project', 'edit')
        if (!auth) {
            return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
        }
        params.method = params.method || 'GET';
        params.method = params.method.toUpperCase();
        params.req_params = params.req_params || [];
        params.res_body_type = params.res_body_type ? params.res_body_type.toLowerCase() : 'json';

        if (!params.project_id) {
            return ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空');
        }

        if (!params.path) {
            return ctx.body = yapi.commons.resReturn(null, 400, '接口请求路径不能为空');
        }

        if (!yapi.commons.verifyPath(params.path)) {
            return ctx.body = yapi.commons.resReturn(null, 400, '接口path第一位必须是/，最后一位不能为/');
        }

        let checkRepeat = await this.Model.checkRepeat(params.project_id, params.path, params.method);

        if (checkRepeat > 0) {
            return ctx.body = yapi.commons.resReturn(null, 401, '已存在的接口:' + params.path + '[' + params.method + ']');
        }

        try {
            let data = {
                project_id: params.project_id,
                catid: params.catid,
                title: params.title,
                path: params.path,
                desc: params.desc,
                method: params.method,
                req_headers: params.req_headers,
                req_body_type: params.req_body_type,
                res_body: params.res_body,
                res_body_type: params.res_body_type,
                uid: this.getUid(),
                add_time: yapi.commons.time(),
                up_time: yapi.commons.time()
            };

            if (params.req_query) {
                data.req_query = params.req_query;
            }

            if (params.req_body_form) {
                data.req_body_form = params.req_body_form;
            }

            if (params.path.indexOf(":") > 0) {
                let paths = params.path.split("/"), name, i;
                for (i = 1; i < paths.length; i++) {
                    if (paths[i][0] === ':') {
                        name = paths[i].substr(1);
                        if (!_.find(params.req_params, { name: name })) {
                            params.req_params.push({
                                name: name,
                                desc: ''
                            })
                        }
                    }
                }
            }

            if (params.req_params.length > 0) {
                data.type = 'var'
                data.req_params = params.req_params;
            } else {
                data.type = 'static'
            }
            if (params.req_body_other) {
                data.req_body_other = params.req_body_other;
            }

            let result = await this.Model.save(data);

            this.catModel.get(params.catid).then((cate) => {
                let username = this.getUsername();
                let title = `用户 "${username}" 为分类 "${cate.name}" 添加了接口 "${data.title}"`
                yapi.commons.saveLog({
                    content: title,
                    type: 'project',
                    uid: this.getUid(),
                    username: username,
                    typeid: params.project_id
                });
                //let project = await this.projectModel.getBaseInfo(params.project_id);
                // let interfaceUrl = `http://${ctx.request.host}/project/${params.project_id}/interface/api/${result._id}`
                // this.sendNotice(params.project_id, {
                //     title: `${username} 新增了接口 ${data.title}`,
                //     content: `<div><h3>${username}新增了接口(${data.title})</h3>
                //     <p>项目名：${project.name}</p>                    
                //     <p>修改用户: "${username}"</p>
                //     <p>接口名: <a href="${interfaceUrl}">${data.title}</a></p>
                //     <p>接口路径: [${data.method}]${data.path}</p></div>`
                // })
            });

            ctx.body = yapi.commons.resReturn(result);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    /**
     * 添加项目分组
     * @interface /interface/get
     * @method GET
     * @category interface
     * @foldnumber 10
     * @param {Number}   id 接口id，不能为空
     * @returns {Object} 
     * @example ./api/interface/get.json
     */
    async get(ctx) {
        let params = ctx.request.query;

        if (!params.id) {
            return ctx.body = yapi.commons.resReturn(null, 400, '接口id不能为空');
        }

        try {
            let result = await this.Model.get(params.id);
            ctx.body = yapi.commons.resReturn(result);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    /**
     * 接口列表
     * @interface /interface/list
     * @method GET
     * @category interface
     * @foldnumber 10
     * @param {Number}   project_id 项目id，不能为空
     * @returns {Object} 
     * @example ./api/interface/list.json
     */
    async list(ctx) {
        let project_id = ctx.request.query.project_id;

        if (!project_id) {
            return ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空');
        }

        try {
            let result = await this.Model.list(project_id);
            ctx.body = yapi.commons.resReturn(result);
        } catch (err) {
            ctx.body = yapi.commons.resReturn(null, 402, err.message);
        }
    }

    async listByCat(ctx) {
        let catid = ctx.request.query.catid;
        if (!catid) {
            return ctx.body = yapi.commons.resReturn(null, 400, 'catid不能为空');
        }
        try {
            let result = await this.Model.listByCatid(catid)
            ctx.body = yapi.commons.resReturn(result);
        } catch (err) {
            ctx.body = yapi.commons.resReturn(null, 402, err.message);
        }

    }

    async listByMenu(ctx) {
        let project_id = ctx.request.query.project_id;
        if (!project_id) {
            return ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空');
        }
        try {
            let result = await this.catModel.list(project_id), newResult = [];
            for (let i = 0, item, list; i < result.length; i++) {
                item = result[i].toObject()
                list = await this.Model.listByCatid(item._id, '_id title method path')
                for (let j = 0; j < list.length; j++) {
                    list[j] = list[j].toObject()
                }
                item.list = list;
                newResult[i] = item
            }
            ctx.body = yapi.commons.resReturn(newResult);
        } catch (err) {
            ctx.body = yapi.commons.resReturn(null, 402, err.message);
        }

    }

    /**
     * 编辑接口
     * @interface /interface/up
     * @method POST
     * @category interface
     * @foldnumber 10
     * @param {Number}   id 接口id，不能为空
     * @param {String}   [path] 接口请求路径
     * @param {String}   [method] 请求方式
     * @param {Array}  [req_headers] 请求的header信息
     * @param {String}  [req_headers[].name] 请求的header信息名
     * @param {String}  [req_headers[].value] 请求的header信息值
     * @param {Boolean}  [req_headers[].required] 是否是必须，默认为否
     * @param {String}  [req_headers[].desc] header描述
     * @param {String}  [req_body_type] 请求参数方式，有["form", "json", "text", "xml"]四种
     * @param {Mixed}  [req_body_form] 请求参数,如果请求方式是form，参数是Array数组，其他格式请求参数是字符串
     * @param {String} [req_body_form[].name] 请求参数名
     * @param {String} [req_body_form[].value] 请求参数值，可填写生成规则（mock）。如@email，随机生成一条email
     * @param {String} [req_body_form[].type] 请求参数类型，有["text", "file"]两种
     * @param {String} [req_body_other]  非form类型的请求参数可保存到此字段
     * @param {String}  [res_body_type] 相应信息的数据格式，有["json", "text", "xml"]三种
     * @param {String} [res_body] 响应信息，可填写任意字符串，如果res_body_type是json,则会调用mock功能
     * @param  {String} [desc] 接口描述 
     * @returns {Object} 
     * @example ./api/interface/up.json
     */

    async up(ctx) {
        let params = ctx.request.body;
        params = yapi.commons.handleParams(params, {
            title: 'string',
            path: 'string',
            method: 'string',
            desc: 'string',
            catid: 'number'
        });

        params.method = params.method || 'GET';
        params.method = params.method.toUpperCase();

        let id = ctx.request.body.id;

        params.message = params.message || '';
        params.message = params.message.replace(/\n/g, "<br>")

        if (!id) {
            return ctx.body = yapi.commons.resReturn(null, 400, '接口id不能为空');
        }

        let interfaceData = await this.Model.get(id);
        let auth = await this.checkAuth(interfaceData.project_id, 'project', 'edit')
        if (!auth) {
            return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
        }

        if (params.path && !yapi.commons.verifyPath(params.path)) {
            return ctx.body = yapi.commons.resReturn(null, 400, '接口path第一位必须是/，最后一位不能为/');
        }

        if (params.path && (params.path !== interfaceData.path || params.method !== interfaceData.method)) {
            let checkRepeat = await this.Model.checkRepeat(interfaceData.project_id, params.path, params.method);
            if (checkRepeat > 0) {
                return ctx.body = yapi.commons.resReturn(null, 401, '已存在的接口:' + params.path + '[' + params.method + ']');
            }
        }

        let data = {
            up_time: yapi.commons.time()
        };

        if (!_.isUndefined(params.path)) {
            data.path = params.path;
        }
        if (!_.isUndefined(params.title)) {
            data.title = params.title;
        }
        if (!_.isUndefined(params.desc)) {
            data.desc = params.desc;
        }
        if (!_.isUndefined(params.method)) {
            data.method = params.method;
        }

        if (!_.isUndefined(params.catid)) {
            data.catid = params.catid;
        }

        if (!_.isUndefined(params.req_headers)) {
            data.req_headers = params.req_headers;
        }

        if (!_.isUndefined(params.req_body_form)) {
            data.req_body_form = params.req_body_form;
        }
        if (params.req_params && Array.isArray(params.req_params) && params.req_params.length > 0) {
            data.type = 'var'
            data.req_params = params.req_params;
        } else {
            data.type = 'static'
            data.req_params = [];
        }

        if (!_.isUndefined(params.req_query)) {
            data.req_query = params.req_query;
        }
        if (!_.isUndefined(params.req_body_other)) {
            data.req_body_other = params.req_body_other;
        }

        if (!_.isUndefined(params.req_body_type)) {
            data.req_body_type = params.req_body_type;
        }

        if (!_.isUndefined(params.res_body_type)) {
            data.res_body_type = params.res_body_type;
        }
        if (!_.isUndefined(params.res_body)) {
            data.res_body = params.res_body;
        }

        if (!_.isUndefined(params.status)) {
            data.status = params.status;
        }



        try {
            let result = await this.Model.up(id, data);
            let username = this.getUsername();
            if (params.catid) {
                this.catModel.get(+params.catid).then((cate) => {
                    yapi.commons.saveLog({
                        content: `用户 "${username}" 更新了分类 "${cate.name}" 下的接口 "${data.title}"`,
                        type: 'project',
                        uid: this.getUid(),
                        username: username,
                        typeid: cate.project_id
                    });
                });
            } else {
                let cateid = interfaceData.catid;
                this.catModel.get(cateid).then((cate) => {
                    yapi.commons.saveLog({
                        content: `用户 "${username}" 更新了分类 "${cate.name}" 下的接口 "${data.title}"`,
                        type: 'project',
                        uid: this.getUid(),
                        username: username,
                        typeid: cate.project_id
                    });
                });
            }
            if (params.switch_notice === true) {
                let project = await this.projectModel.getBaseInfo(interfaceData.project_id);
                let interfaceUrl = `http://${ctx.request.host}/project/${interfaceData.project_id}/interface/api/${id}`
                this.sendNotice(interfaceData.project_id, {
                    title: `${username} 更新了接口`,
                    content: `<div><h3>${username}更新了接口(${data.title})</h3>
                    <p>项目名：${project.name} </p>
                    <p>修改用户: ${username}</p>
                    <p>接口名: <a href="${interfaceUrl}">${data.title}</a></p>
                    <p>接口路径: [${data.method}]${data.path}</p>
                    <p>详细改动日志: ${params.message}</p></div>`
                })
            }

            ctx.body = yapi.commons.resReturn(result);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }

    }

    /**
     * 删除接口
     * @interface /interface/del
     * @method GET
     * @category interface
     * @foldnumber 10
     * @param {Number}   id 接口id，不能为空
     * @returns {Object} 
     * @example ./api/interface/del.json
     */

    async del(ctx) {
        try {
            let id = ctx.request.body.id;

            if (!id) {
                return ctx.body = yapi.commons.resReturn(null, 400, '接口id不能为空');
            }

            let data = await this.Model.get(ctx.request.body.id);

            if (data.uid != this.getUid()) {
                let auth = await this.checkAuth(data.project_id, 'project', 'danger')
                if (!auth) {
                    return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
                }
            }

            let inter = await this.Model.get(id);
            let result = await this.Model.del(id);
            await this.caseModel.delByInterfaceId(id);
            let username = this.getUsername();
            this.catModel.get(inter.catid).then((cate) => {
                yapi.commons.saveLog({
                    content: `用户 "${username}" 删除了分类 "${cate.name}" 下的接口 "${inter.title}"`,
                    type: 'project',
                    uid: this.getUid(),
                    username: username,
                    typeid: cate.project_id
                });
            })


            ctx.body = yapi.commons.resReturn(result);
        } catch (err) {
            ctx.body = yapi.commons.resReturn(null, 402, err.message);
        }
    }

    async solveConflict(ctx) {
        try {
            let id = parseInt(ctx.query.id, 10), result, userInst, userinfo, data;
            if (!id) return ctx.websocket.send("id 参数有误");
            result = await this.Model.get(id), userinfo;
            if (result.edit_uid !== 0 && result.edit_uid !== this.getUid()) {
                userInst = yapi.getInst(userModel);
                userinfo = await userInst.findById(result.edit_uid);
                data = {
                    errno: result.edit_uid,
                    data: { uid: result.edit_uid, username: userinfo.username }
                }
            } else {
                this.Model.upEditUid(id, this.getUid()).then()
                data = {
                    errno: 0,
                    data: result
                }
            }
            ctx.websocket.send(JSON.stringify(data));
            ctx.websocket.on('close', () => {
                this.Model.upEditUid(id, 0).then()
            })
        } catch (err) {
            yapi.commons.log(err, 'error')
        }
    }

    async addCat(ctx) {
        try {
            let params = ctx.request.body;
            params = yapi.commons.handleParams(params, {
                name: 'string',
                project_id: 'number',
                desc: 'string'
            });

            if (!params.project_id) {
                return ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空');
            }

            let auth = await this.checkAuth(params.project_id, 'project', 'edit')
            if (!auth) {
                return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
            }
            if (!params.name) {
                return ctx.body = yapi.commons.resReturn(null, 400, '名称不能为空');
            }


            let result = await this.catModel.save({
                name: params.name,
                project_id: params.project_id,
                desc: params.desc,
                uid: this.getUid(),
                add_time: yapi.commons.time(),
                up_time: yapi.commons.time()
            })

            let username = this.getUsername();
            yapi.commons.saveLog({
                content: `用户 "${username}" 添加了分类 "${params.name}"`,
                type: 'project',
                uid: this.getUid(),
                username: username,
                typeid: params.project_id
            });

            ctx.body = yapi.commons.resReturn(result);

        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    async upCat(ctx) {
        try {
            let params = ctx.request.body;
            let result = await this.catModel.up(params.catid, {
                name: params.name,
                desc: params.desc,
                up_time: yapi.commons.time()
            });

            let username = this.getUsername();
            let cate = await this.catModel.get(params.catid);

            let auth = await this.checkAuth(cate.project_id, 'project', 'edit')
            if (!auth) {
                return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
            }
            yapi.commons.saveLog({
                content: `用户 "${username}" 更新了分类 "${cate.name}"`,
                type: 'project',
                uid: this.getUid(),
                username: username,
                typeid: cate.project_id
            });

            ctx.body = yapi.commons.resReturn(result)
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 400, e.message)
        }
    }

    async delCat(ctx) {
        try {
            let id = ctx.request.body.catid;
            let catData = await this.catModel.get(id);
            if (!catData) {
                ctx.body = yapi.commons.resReturn(null, 400, "不存在的分类")
            }

            if (catData.uid !== this.getUid()) {
                let auth = await this.checkAuth(catData.project_id, 'project', 'danger')
                if (!auth) {
                    return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
                }
            }

            let username = this.getUsername();
            yapi.commons.saveLog({
                content: `用户 "${username}" 删除了分类 "${catData.name}" 及该分类下的接口`,
                type: 'project',
                uid: this.getUid(),
                username: username,
                typeid: catData.project_id
            });

            let result = await this.catModel.del(id);
            let r = await this.Model.delByCatid(id);
            return ctx.body = yapi.commons.resReturn(r);
        } catch (e) {
            yapi.commons.resReturn(null, 400, e.message)
        }
    }

        /**
     * 接口数据上传
     * @interface /interface/interUpload
     * @method POST
     * @category interface
     * @foldnumber 10
     * @param {Number}   project_id 项目id，不能为空
     * @param {String}   title 接口标题，不能为空
     * @param {String}   path 接口请求路径，不能为空
     * @param {String}   method 请求方式
     * @param {Array}  [req_headers] 请求的header信息
     * @param {String}  [req_headers[].name] 请求的header信息名
     * @param {String}  [req_headers[].value] 请求的header信息值
     * @param {Boolean}  [req_headers[].required] 是否是必须，默认为否
     * @param {String}  [req_headers[].desc] header描述
     * @param {String}  [req_body_type] 请求参数方式，有["form", "json", "text", "xml"]四种
     * @param {Array} [req_params] name, desc两个参数
     * @param {Mixed}  [req_body_form] 请求参数,如果请求方式是form，参数是Array数组，其他格式请求参数是字符串
     * @param {String} [req_body_form[].name] 请求参数名
     * @param {String} [req_body_form[].value] 请求参数值，可填写生成规则（mock）。如@email，随机生成一条email
     * @param {String} [req_body_form[].type] 请求参数类型，有["text", "file"]两种
     * @param {String} [req_body_other]  非form类型的请求参数可保存到此字段
     * @param {String}  [res_body_type] 相应信息的数据格式，有["json", "text", "xml"]三种
     * @param {String} [res_body] 响应信息，可填写任意字符串，如果res_body_type是json,则会调用mock功能
     * @param  {String} [desc] 接口描述 
     * @returns {Object} 
     * @example ./api/interface/add.json
     */
    async interUpload(ctx) {
        let interData = ctx.request.body.interData;
        let project_id = ctx.request.body.project_id;
        let request = interData.requests;
        let data1 = [];
        let catid = ctx.request.body.catid;
        
        let auth = await this.checkAuth(project_id, 'project', 'danger');
        if (!auth) {
            return ctx.body = yapi.commons.resReturn(null, 400, '没有权限');
        }
        if (!project_id) {
            return ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空');
        }
        if (!catid) {
            return ctx.body = yapi.commons.resReturn(null, 400, '分类id不能为空');
        }
        
        const len = request.length;
        let successNum = len;
        
        if(request &&len){
            for(let i = 0;i<len;i++){
                try {
                    let path = url.parse(request[i].url.replace(/{{(\w+)}}/,'')).path;
                    let reg = /^(\w+):\/\/([^\/:]*)(?::(\d+))?\/([^\/\?]*)(\/.*)/;
                    // let path = request[i].url;
                    // let result = path.match(reg);
                    // if(result){
                    //     path = result[4]+ result[5];
                    //     path = path.split('?')[0].replace(/{{(\w+)}}/,'').replace(/\/$/,'');
                    //     if(path.indexOf("/") > 0){
                    //         path = '/'+ path;
                    //     }
                    // }else{
                    //     // path.replace(/\{\{\ [0-9a-zA-Z-_]* }\}/g,'');
                    //     path = path.replace(/{{(\w+)}}/,'');
                    //     if(path.indexOf("/") > 0){
                    //         path = '/'+ path;
                    //     }
                    // }
                    let title = request[i].name;
                    if(reg.test(request[i].name)){
                        title = path;
                    }
                    let inter = {
                        project_id: project_id,
                        title: title,
                        path: path,
                        method: request[i].method,
                        req_headers: '',
                        // req_body_type: request[i].dataMode,
                        req_params: '',
                        req_body_form: '',
                        req_body_other: '',
                        res_body_type: 'json',
                        res_body: '',
                        desc: request[i].description
                    };
                    console.log(inter.path);
                    //  req_body_type   req_body_form
                    if(request[i].dataMode){
                        // console.log(i);
                        if(request[i].dataMode === 'params' || request[i].dataMode==='urlencoded'){
                            inter.req_body_type = 'form';
                            inter.req_body_form = [];
                            const data = request[i].data;
                            for(let item in data){
                                inter.req_body_form.push({
                                    name: data[item].key,
                                    value: data[item].value,
                                    type: data[item].type
                                });
                            }
                        }else if(request[i].dataMode === 'raw'){
                            inter.req_body_form = [];
                            // console.log(request[i].headers.inedxOf('application/json')>-1);
                            if(request[i].headers&&request[i].headers.indexOf('application/json')>-1){
                                inter.req_body_type = 'json';
                            }else{
                                inter.req_body_type = 'raw';
                            }
                            inter.req_body_other = request[i].rawModeData;
                        }else if(request[i].dataMode === 'binary'){
                            
                            inter.req_body_type = 'file';
                            inter.req_body_other = request[i].rawModeData;
                        }
                    }
                    // req_params
                    if(request[i].queryParams){
                        inter.req_params = [];
                        const queryParams = request[i].queryParams;
                        for(let item in queryParams){
                            inter.req_params.push({
                                name: queryParams[item].key,
                                desc: queryParams[item].description,
                                required: queryParams[item].enable
                            });
                        }
                    }

                    // req_headers
                    if(request[i].headerData){
                        inter.req_headers = [];
                        const headerData = request[i].headerData;
                        for(let item in headerData){
                            inter.req_headers.push({
                                name: headerData[item].key,
                                value: headerData[item].value,
                                required: headerData[item].enable,
                                desc: headerData[item].description
                            });
                        }
                    }
                    if (!inter.project_id) {
                        // return ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空');
                        continue;
                    }
                    if (!inter.path) {
                        // return ctx.body = yapi.commons.resReturn(null, 400, '接口请求路径不能为空');
                        continue;
                    }
                    if (!yapi.commons.verifyPath(inter.path)) {
                        successNum--;
                        // return ctx.body = yapi.commons.resReturn(null, 400, '接口path第一位必须是/，最后一位不能为/');
                        continue;
                    }
                    let checkRepeat = await this.Model.checkRepeat(inter.project_id, inter.path, inter.method);

                    if (checkRepeat > 0) {
                        successNum--;
                        // return ctx.body = yapi.commons.resReturn(null, 401, '已存在的接口:' + inter.path + '[' + inter.method + ']');
                        continue;
                    }

                    
                    let data = {
                        ...inter,
                        catid: catid,
                        uid: this.getUid(),
                        add_time: yapi.commons.time(),
                        up_time: yapi.commons.time()
                    };
                    if ( data.req_params.length > 0) {
                        data.type = 'var';
                        data.req_params = data.req_params;
                    } else {
                        data.type = 'static';
                    }
                    // data1.push(data);
                    // console.log(data);
                    let res = await this.Model.save(data);
                    // return ctx.body = yapi.commons.resReturn(res);
                }catch(e){
                    // ctx.body = yapi.commons.resReturn(e.message);
                    successNum--;
                }
            }
        }
        
        try{
            if(successNum){
                this.catModel.get(catid).then((cate) => {
                    let username = this.getUsername();
                    yapi.commons.saveLog({
                        content: `用户 "${username}" 为分类 "${cate.name}" 成功导入了 ${successNum} 个接口`,
                        type: 'project',
                        uid: this.getUid(),
                        username: username,
                        typeid: project_id
                    });
                });
            }
            
        }catch(e){
            
        }
        
        return ctx.body = yapi.commons.resReturn(successNum);
    }

    
    async getCatMenu(ctx) {
        let project_id = ctx.request.query.project_id;
        if(!project_id){
            return ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空');
        }
        try{
            let res = await this.catModel.list(project_id);
            return ctx.body = yapi.commons.resReturn(res);
        }catch(e){
            yapi.commons.resReturn(null, 400, e.message);
        }
        
        
    }

    sendNotice(projectId, data) {
        this.followModel.listByProjectId(projectId).then(list => {
            let users = [];
            list.forEach(item => {
                users.push(item.uid)
            })
            this.userModel.findByUids(users).then(list => {
                list.forEach(item => {
                    yapi.commons.sendMail({
                        to: item.email,
                        contents: data.content,
                        subject: data.title
                    });
                })

            })

        });

    }

}

module.exports = interfaceController;